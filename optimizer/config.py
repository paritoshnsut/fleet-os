# config.py — all assumptions live here. Change one value, entire optimizer updates.
# Values marked # CONFIRM need sign-off from manager before production use.

# ─── Bus specs ───────────────────────────────────────────────────────────────
BUS_TYPES = {
    "36seater_3batt": {
        "seats": 36,
        "range_km_bol": 162.0,      # BOL @ 80% SOC — from manager's sheet
        "range_km_eol": 130.0,      # EOL @ 80% SOC — from manager's sheet
        "battery_label": "3 Batt",
    },
    "36seater_4batt": {
        "seats": 36,
        "range_km_bol": 217.0,      # BOL @ 80% SOC — from manager's sheet
        "range_km_eol": 174.0,      # EOL @ 80% SOC — from manager's sheet
        "battery_label": "4 Batt",
    },
    "22seater_3batt": {
        "seats": 22,
        "range_km_bol": 140.0,      # CONFIRM
        "range_km_eol": 110.0,      # CONFIRM
        "battery_label": "3 Batt",
    },
}

DEFAULT_BUS_TYPE_36 = "36seater_3batt"
DEFAULT_BUS_TYPE_22 = "22seater_3batt"

# ─── Charging ─────────────────────────────────────────────────────────────────
NUM_CHARGERS        = 21        # from manager's sheet ("20+1")
CHARGER_POWER_KW    = 60        # DC fast — CONFIRM
CONSUMPTION_KWH_PER_KM = 1.4   # from manager's sheet (300 kWh / 217 km ≈ 1.38)
SOC_FLOOR_PCT       = 20        # never drop below 20%
SOC_START_PCT       = 80        # start of day at 80% (from manager's sheet convention)
MIN_CHARGE_WINDOW_MIN = 30      # don't bother charging for <30 min

# Derived: charging speed in km of range per minute
# A 60kW charger on a ~300kWh pack at 1.4 kWh/km:
#   kWh gained per minute = 60/60 = 1 kWh
#   km restored per minute = 1 / 1.4 = 0.714 km/min
CHARGE_RATE_KM_PER_MIN = CHARGER_POWER_KW / 60 / CONSUMPTION_KWH_PER_KM

# ─── Depot & deadhead ─────────────────────────────────────────────────────────
DEPOT_NAME              = "TCS Adibatala"   # CONFIRM exact location
DEADHEAD_FACTOR         = 1.4               # straight-line × 1.4 ≈ road distance
AVG_SPEED_KMPH          = 25                # urban Hyderabad
PARKING_DEAD_KM_PER_BUS = 2.5              # from manager's Consolidate sheet
DEPOT_TO_ROUTE_KM       = 6.0              # "location 6 km away" — from manager's sheet

# ─── Operations ───────────────────────────────────────────────────────────────
DRIVER_MAX_HOURS_PER_DAY = 9               # MoRTH guideline — CONFIRM
DRIVER_BREAK_MIN         = 30              # mandatory break
MAINTENANCE_FLOAT_PCT    = 4               # % extra buses for maintenance buffer

# ─── Trip timing ──────────────────────────────────────────────────────────────
# After a drop trip, bus needs this long to return to depot / next pickup zone
BUFFER_AFTER_TRIP_MIN = 30   # CONFIRM
# How long before a pickup must the bus leave the depot
BUFFER_BEFORE_PICKUP_MIN = 30  # CONFIRM

# ─── Pricing (for ROI story) ──────────────────────────────────────────────────
CONTRACT_RATE_INR_PER_KM = 56.5   # from FleetOS demo
WORKING_DAYS_PER_MONTH   = 26
