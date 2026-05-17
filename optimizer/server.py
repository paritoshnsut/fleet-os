"""
server.py — FastAPI service for the Trip Planner optimizer.
Runs on port 8000. Frontend calls it directly.

Endpoints:
  POST /parse          — upload Excel, returns parsed trip summary + preview
  POST /optimize       — upload Excel + config, returns full optimization results
  GET  /config         — returns current config assumptions
  GET  /health         — health check
"""

import os
import json
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config as cfg
from ingest import parse_excel, trips_summary
from scheduler import greedy_scheduler, pairing_heuristic, ortools_scheduler, compare

app = FastAPI(title="FleetOS Trip Planner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "trip-planner-optimizer"}


@app.get("/config")
def get_config():
    """Return all configurable assumptions so the frontend can show/edit them."""
    return {
        "bus_types":               cfg.BUS_TYPES,
        "num_chargers":            cfg.NUM_CHARGERS,
        "charger_power_kw":        cfg.CHARGER_POWER_KW,
        "avg_speed_kmph":          cfg.AVG_SPEED_KMPH,
        "soc_floor_pct":           cfg.SOC_FLOOR_PCT,
        "parking_dead_km_per_bus": cfg.PARKING_DEAD_KM_PER_BUS,
        "contract_rate_inr_per_km":cfg.CONTRACT_RATE_INR_PER_KM,
        "working_days_per_month":  cfg.WORKING_DAYS_PER_MONTH,
        "maintenance_float_pct":   cfg.MAINTENANCE_FLOAT_PCT,
        "benchmark_buses_36seat":  113,
        "benchmark_buses_22seat":  7,
    }


@app.post("/parse")
async def parse_route_file(file: UploadFile = File(...)):
    """
    Upload client Excel. Returns:
    - trips summary (counts, km, seat classes)
    - first 20 trips as preview
    - any parse errors/warnings
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "Please upload an Excel file (.xlsx or .xls)")

    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        trips, errors = parse_excel(tmp_path)
        summary = trips_summary(trips)
        preview = [t.to_dict() for t in trips[:20]]
        return {
            "filename": file.filename,
            "summary":  summary,
            "preview":  preview,
            "errors":   errors,
            "trip_count": len(trips),
        }
    except Exception as e:
        raise HTTPException(500, f"Parse failed: {str(e)}")
    finally:
        os.unlink(tmp_path)


@app.post("/optimize")
async def optimize(
    file: UploadFile = File(...),
    benchmark_buses: int = Form(113),
):
    """
    Upload client Excel and run both optimizers.
    Returns greedy result, pairing result, and comparison table.
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "Please upload an Excel file (.xlsx or .xls)")

    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        trips, parse_errors = parse_excel(tmp_path)
        if not trips:
            raise HTTPException(422, f"No trips parsed. Errors: {parse_errors}")

        summary     = trips_summary(trips)
        greedy_res  = greedy_scheduler(trips)
        pairing_res = pairing_heuristic(trips)
        ortools_res = ortools_scheduler(trips, time_limit_sec=30)
        comparison  = compare(greedy_res, pairing_res, ortools_res, benchmark_buses=benchmark_buses)

        return {
            "parse_errors": parse_errors,
            "summary":      summary,
            "comparison":   comparison,
            "greedy":       greedy_res.to_dict(),
            "pairing":      pairing_res.to_dict(),
            "ortools":      ortools_res.to_dict(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Optimization failed: {str(e)}")
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
