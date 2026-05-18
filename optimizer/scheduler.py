"""
scheduler.py — Two-phase bus scheduling optimizer.

Phase 1 — Greedy First-Fit:
  Sort trips chronologically, assign each to the first feasible idle bus.
  Simple baseline — gives upper-bound bus count.

Phase 2 — Pairing Heuristic (mirrors manager's manual logic):
  1. Match each AM pickup with its corresponding PM drop (same route, "Both" type).
  2. Sort pairs by KM ascending within each in-time group.
  3. For each pair, attempt to insert a 14:00 midday leg from remaining pickup-only trips.
  4. Schedule charging windows in the idle gaps.
  Expected to reproduce manager's ~113 buses on Adibatala data.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict
from ingest import Trip
import config as cfg
import copy


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class Leg:
    trip_id:      str
    route_name:   str
    trip_type:    str       # 'pickup' | 'drop'
    start_min:    int
    end_min:      int
    distance_km:  float
    charge_start: Optional[int]   = None   # charging window after this leg
    charge_end:   Optional[int]   = None
    km_charged:   float           = 0.0    # km of range recovered
    soc_start:    Optional[float] = None   # SOC (%) at start of leg — set by _compute_soc_profiles
    soc_end:      Optional[float] = None   # SOC (%) at end of leg (after discharge, before charging)

    def to_dict(self):
        d = asdict(self)
        d['start_time'] = _min_to_hhmm(self.start_min)
        d['end_time']   = _min_to_hhmm(self.end_min)
        if self.charge_start:
            d['charge_start_time'] = _min_to_hhmm(self.charge_start)
            d['charge_end_time']   = _min_to_hhmm(self.charge_end)
        return d


@dataclass
class BusSchedule:
    bus_id:       int
    seats:        int
    legs:         List[Leg] = field(default_factory=list)
    battery_type: str = "3 Batt"

    @property
    def run_km(self) -> float:
        return sum(l.distance_km for l in self.legs)

    @property
    def dead_km(self) -> float:
        return cfg.PARKING_DEAD_KM_PER_BUS  # simplified; would need route proximity data for exact

    @property
    def total_km(self) -> float:
        return self.run_km + self.dead_km

    @property
    def free_at(self) -> int:
        return self.legs[-1].charge_end or self.legs[-1].end_min if self.legs else 0

    @property
    def soc_remaining(self) -> float:
        """Approximate SOC as km remaining after all assigned trips (before charging)."""
        km_driven   = self.run_km
        km_recharged = sum(l.km_charged for l in self.legs)
        range_km    = cfg.BUS_TYPES[self._bus_type_key()]['range_km_bol']
        return max(0.0, range_km - km_driven + km_recharged)

    def _bus_type_key(self) -> str:
        seats = self.seats
        batt  = self.battery_type.replace(' ', '').lower()
        for k in cfg.BUS_TYPES:
            if str(seats) in k and batt in k:
                return k
        return f"{seats}seater_3batt"

    def range_km(self) -> float:
        key = self._bus_type_key()
        return cfg.BUS_TYPES.get(key, {}).get('range_km_bol', 162.0)

    @property
    def charge_events(self) -> int:
        return sum(1 for l in self.legs if l.charge_start is not None)

    @property
    def charge_dead_km(self) -> float:
        """Dead km under the depot-charging model: each charge event = 2 × depot distance."""
        return round(self.charge_events * 2 * cfg.DEPOT_TO_ROUTE_KM, 1)

    @property
    def total_charge_min(self) -> int:
        return sum(
            (l.charge_end - l.charge_start)
            for l in self.legs if l.charge_start is not None
        )

    @property
    def soc_min(self) -> Optional[float]:
        vals = [l.soc_end for l in self.legs if l.soc_end is not None]
        return round(min(vals), 1) if vals else None

    def to_dict(self):
        return {
            "bus_id":           self.bus_id,
            "seats":            self.seats,
            "battery_type":     self.battery_type,
            "run_km":           round(self.run_km, 1),
            "dead_km":          round(self.dead_km, 1),
            "total_km":         round(self.total_km, 1),
            "leg_count":        len(self.legs),
            # — new fields (additive) —
            "charge_events":    self.charge_events,
            "charge_dead_km":   self.charge_dead_km,
            "total_charge_min": self.total_charge_min,
            "soc_min":          self.soc_min,
            "legs":             [l.to_dict() for l in self.legs],
        }


@dataclass
class OptimizationResult:
    algorithm:   str
    bus_count:   int
    total_run_km:  float
    total_dead_km: float
    buses:       List[BusSchedule]
    unserved_trips: List[str] = field(default_factory=list)

    @property
    def total_km(self) -> float:
        return self.total_run_km + self.total_dead_km

    @property
    def avg_utilization_pct(self) -> float:
        if not self.buses:
            return 0.0
        avg_range = sum(b.range_km() for b in self.buses) / len(self.buses)
        avg_run   = self.total_run_km / len(self.buses) if self.buses else 0
        return round(min(100.0, avg_run / avg_range * 100), 1)

    def to_dict(self):
        total_charge_events = sum(b.charge_events    for b in self.buses)
        total_charge_min    = sum(b.total_charge_min for b in self.buses)
        total_charge_dead   = sum(b.charge_dead_km   for b in self.buses)
        # Peak simultaneous chargers: max buses charging at any 1-minute slot
        peak_chargers = _peak_simultaneous_chargers(self.buses)

        return {
            "algorithm":          self.algorithm,
            "bus_count":          self.bus_count,
            "total_run_km":       round(self.total_run_km, 1),
            "total_dead_km":      round(self.total_dead_km, 1),
            "total_km":           round(self.total_km, 1),
            "avg_utilization_pct": self.avg_utilization_pct,
            "unserved_trips":     self.unserved_trips,
            # — new block (additive) —
            "charging_summary": {
                "total_charge_events":  total_charge_events,
                "total_charge_min":     total_charge_min,
                "total_charge_dead_km": round(total_charge_dead, 1),
                "peak_simultaneous_chargers": peak_chargers,
                "avg_charge_events_per_bus": round(total_charge_events / max(1, self.bus_count), 2),
            },
            "buses":              [b.to_dict() for b in self.buses],
            "strategy_comparison": _compute_strategy_comparison(self.buses),
        }


# ─── Phase 1: Greedy First-Fit ────────────────────────────────────────────────

def greedy_scheduler(trips: List[Trip]) -> OptimizationResult:
    """
    Assign trips chronologically to the first available feasible bus.
    Creates a new bus when no existing bus can take the trip.
    """
    buses: Dict[int, BusSchedule] = {}
    bus_counter = 0
    # Track per-bus: km remaining before next charge, free_at_min
    bus_state: Dict[int, dict] = {}
    unserved = []

    for trip in sorted(trips, key=lambda t: t.start_min):
        assigned = False

        for bus_id, state in sorted(bus_state.items(), key=lambda x: x[1]['free_at']):
            bus = buses[bus_id]
            if bus.seats < trip.seats_needed:
                continue

            buffer = cfg.BUFFER_BEFORE_PICKUP_MIN if trip.trip_type == 'pickup' else cfg.BUFFER_AFTER_TRIP_MIN
            if state['free_at'] + buffer > trip.start_min:
                continue  # bus still occupied

            if state['km_left'] < trip.distance_km:
                # Try to charge during idle gap
                idle_mins  = trip.start_min - state['free_at']
                km_recharged = idle_mins * cfg.CHARGE_RATE_KM_PER_MIN
                new_km_left  = min(bus.range_km(), state['km_left'] + km_recharged)
                if new_km_left < trip.distance_km:
                    continue  # still not enough range even after charging

                # Schedule charging on last leg
                if bus.legs:
                    last_leg = bus.legs[-1]
                    charge_start = last_leg.end_min + 5
                    charge_end   = min(trip.start_min - 5, charge_start + int(km_recharged / cfg.CHARGE_RATE_KM_PER_MIN))
                    last_leg.charge_start = charge_start
                    last_leg.charge_end   = charge_end
                    last_leg.km_charged   = km_recharged
                state['km_left'] = new_km_left

            leg = Leg(
                trip_id    = trip.trip_id,
                route_name = trip.route_name,
                trip_type  = trip.trip_type,
                start_min  = trip.start_min,
                end_min    = trip.end_min,
                distance_km = trip.distance_km,
            )
            bus.legs.append(leg)
            state['km_left'] -= trip.distance_km
            state['free_at']  = trip.end_min + cfg.BUFFER_AFTER_TRIP_MIN
            assigned = True
            break

        if not assigned:
            # Spawn new bus
            bus_counter += 1
            seat_class = trip.seats_needed
            btype = cfg.DEFAULT_BUS_TYPE_36 if seat_class >= 36 else cfg.DEFAULT_BUS_TYPE_22
            new_bus = BusSchedule(bus_id=bus_counter, seats=seat_class)
            leg = Leg(
                trip_id    = trip.trip_id,
                route_name = trip.route_name,
                trip_type  = trip.trip_type,
                start_min  = trip.start_min,
                end_min    = trip.end_min,
                distance_km = trip.distance_km,
            )
            new_bus.legs.append(leg)
            buses[bus_counter] = new_bus
            bus_state[bus_counter] = {
                'km_left': new_bus.range_km() - trip.distance_km,
                'free_at': trip.end_min + cfg.BUFFER_AFTER_TRIP_MIN,
            }

    bus_list = list(buses.values())
    _compute_soc_profiles(bus_list)
    # _add_opportunistic_charging(bus_list)  # PENDING MANAGER REVIEW
    return OptimizationResult(
        algorithm     = "Greedy First-Fit",
        bus_count     = len(bus_list),
        total_run_km  = sum(b.run_km for b in bus_list),
        total_dead_km = sum(b.dead_km for b in bus_list),
        buses         = bus_list,
        unserved_trips = unserved,
    )


# ─── Phase 2: Pairing Heuristic ───────────────────────────────────────────────

def pairing_heuristic(trips: List[Trip]) -> OptimizationResult:
    """
    Mirrors the manager's manual logic:
    1. Find routes that have BOTH an AM pickup AND a PM drop (same route_id).
    2. Sort pairs by KM ascending — manager's approach.
    3. For each paired bus, try to insert a 14:00 midday pickup from the midday pool.
    4. Charging windows go in idle gaps between legs.
    5. Unpaired trips (pickup-only, drop-only, afternoon shift) handled by greedy fallback.
    """
    buses: List[BusSchedule] = []
    bus_counter = 0

    AM_TIMES  = {540, 600, 660}   # 9:00, 10:00, 11:00
    MIDDAY    = 840                # 14:00

    # Build lookup maps
    am_by_route:  Dict[int, Trip] = {}
    drop_by_route: Dict[int, Trip] = {}
    midday_pool:  List[Trip] = []
    leftover:     List[Trip] = []

    for t in trips:
        if t.trip_type == 'pickup' and t.end_min in AM_TIMES:
            # end_min = office arrival time (in_time); use that to categorise
            am_by_route[t.route_id] = t
        elif t.trip_type == 'pickup' and t.end_min == MIDDAY:
            midday_pool.append(t)
        elif t.trip_type == 'drop':
            drop_by_route[t.route_id] = t
        else:
            leftover.append(t)   # 15:00 afternoon pickups etc.

    # Routes that have BOTH an AM pickup and a PM drop → one bus per pair
    paired_ids = set(am_by_route.keys()) & set(drop_by_route.keys())

    # Sort by AM distance ascending (manager's style)
    paired_sorted = sorted(paired_ids, key=lambda rid: am_by_route[rid].distance_km)

    # Sort midday pool: try largest first so we fill battery efficiently
    midday_pool.sort(key=lambda t: t.distance_km, reverse=True)
    used_midday = set()

    for rid in paired_sorted:
        am_trip   = am_by_route[rid]
        drop_trip = drop_by_route[rid]

        bus_counter += 1
        bus = BusSchedule(bus_id=bus_counter, seats=max(am_trip.seats_needed, drop_trip.seats_needed))
        range_km = bus.range_km()
        soc_floor_km = range_km * cfg.SOC_FLOOR_PCT / 100
        km_used = 0.0

        # ── Leg 1: AM pickup ──────────────────────────────────────────
        leg_am = Leg(
            trip_id=am_trip.trip_id, route_name=am_trip.route_name,
            trip_type='pickup', start_min=am_trip.start_min,
            end_min=am_trip.end_min, distance_km=am_trip.distance_km,
        )
        km_used += am_trip.distance_km

        # Charge after AM leg (bus returns to depot, charges until ~13:30)
        cs1 = am_trip.end_min + 15
        ce1 = 810   # 13:30 — must leave by 13:30 for 14:00 midday pickup
        if ce1 - cs1 >= cfg.MIN_CHARGE_WINDOW_MIN:
            km_recovered = min(range_km - km_used, (ce1 - cs1) * cfg.CHARGE_RATE_KM_PER_MIN)
            leg_am.charge_start = cs1
            leg_am.charge_end   = ce1
            leg_am.km_charged   = max(0.0, km_recovered)
            km_used = max(0.0, km_used - km_recovered)

        bus.legs.append(leg_am)

        # ── Leg 2: Midday pickup (optional, 14:00) ───────────────────
        for mid in midday_pool:
            if mid.trip_id in used_midday:
                continue
            if mid.seats_needed > bus.seats:
                continue
            # Must fit in budget: midday + drop + safety floor
            if km_used + mid.distance_km + drop_trip.distance_km > range_km - soc_floor_km:
                continue

            used_midday.add(mid.trip_id)
            leg_mid = Leg(
                trip_id=mid.trip_id, route_name=mid.route_name,
                trip_type='pickup', start_min=mid.start_min,
                end_min=mid.end_min, distance_km=mid.distance_km,
            )
            km_used += mid.distance_km

            # Charge after midday leg (until PM drop departs)
            cs2 = mid.end_min + 15
            ce2 = drop_trip.start_min - 10
            if ce2 - cs2 >= cfg.MIN_CHARGE_WINDOW_MIN:
                km_recovered2 = min(range_km - km_used, (ce2 - cs2) * cfg.CHARGE_RATE_KM_PER_MIN)
                leg_mid.charge_start = cs2
                leg_mid.charge_end   = ce2
                leg_mid.km_charged   = max(0.0, km_recovered2)
                km_used = max(0.0, km_used - km_recovered2)

            bus.legs.append(leg_mid)
            break

        # ── Leg 3: PM drop ────────────────────────────────────────────
        if km_used + drop_trip.distance_km <= range_km - soc_floor_km:
            bus.legs.append(Leg(
                trip_id=drop_trip.trip_id, route_name=drop_trip.route_name,
                trip_type='drop', start_min=drop_trip.start_min,
                end_min=drop_trip.end_min, distance_km=drop_trip.distance_km,
            ))
            km_used += drop_trip.distance_km
        else:
            # Not enough range — put drop in leftover for fallback
            leftover.append(drop_trip)
            # Upgrade battery if close to 3-batt ceiling
            bus.battery_type = "4 Batt"

        if km_used > cfg.BUS_TYPES["36seater_3batt"]["range_km_bol"] * 0.92:
            bus.battery_type = "4 Batt"

        buses.append(bus)

    # ── Fallback greedy for everything not handled above ──────────────
    # Unpaired AM pickups
    for rid, t in am_by_route.items():
        if rid not in paired_ids:
            leftover.append(t)
    # Unpaired drops
    for rid, t in drop_by_route.items():
        if rid not in paired_ids:
            leftover.append(t)
    # Unused midday trips
    for t in midday_pool:
        if t.trip_id not in used_midday:
            leftover.append(t)

    if leftover:
        fallback = greedy_scheduler(leftover)
        for fb_bus in fallback.buses:
            bus_counter += 1
            fb_bus.bus_id = bus_counter
            buses.append(fb_bus)

    _compute_soc_profiles(buses)
    # _add_opportunistic_charging(buses)  # PENDING MANAGER REVIEW
    return OptimizationResult(
        algorithm     = "Pairing Heuristic",
        bus_count     = len(buses),
        total_run_km  = sum(b.run_km for b in buses),
        total_dead_km = sum(b.dead_km for b in buses),
        buses         = buses,
    )


# ─── Phase 3: OR-Tools CP-SAT (E-VSP via max bipartite matching) ─────────────

def _can_follow(ti: Trip, tj: Trip) -> bool:
    """
    Can trip tj directly follow trip ti on the same bus?
    Checks: seat class match, time feasibility, and battery feasibility
    (accounting for charging during idle time between trips).
    """
    if ti.seats_needed != tj.seats_needed:
        return False
    if ti.end_min + cfg.BUFFER_AFTER_TRIP_MIN > tj.start_min:
        return False

    idle_min   = tj.start_min - ti.end_min
    km_recharged = idle_min * cfg.CHARGE_RATE_KM_PER_MIN
    bus_type_key = cfg.DEFAULT_BUS_TYPE_36 if ti.seats_needed >= 36 else cfg.DEFAULT_BUS_TYPE_22
    range_km   = cfg.BUS_TYPES[bus_type_key]['range_km_bol']

    # Combined km of both trips must fit within range + what we can recharge in idle time
    return ti.distance_km + tj.distance_km <= range_km + km_recharged


def ortools_scheduler(trips: List[Trip], time_limit_sec: int = 30) -> OptimizationResult:
    """
    Formulates the Electric Vehicle Scheduling Problem as a maximum bipartite
    matching using OR-Tools CP-SAT.

    Model:
      - Boolean variable follows[i,j] = 1 if trip j directly follows trip i
        on the same bus (time-feasible + battery-feasible).
      - Each trip has at most one direct successor and one direct predecessor.
      - Maximising total "follow" links = minimising number of buses
        (buses = trips − links).

    This is the classic Minimum Fleet Size formulation for VSP and produces
    near-optimal or optimal results for the E-VSP when battery constraints
    are encoded in the can-follow predicate.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return greedy_scheduler(trips)   # graceful fallback

    trips_s = sorted(trips, key=lambda t: t.start_min)
    n = len(trips_s)

    # Pre-compute feasible (i → j) pairs
    can_chain = [(i, j) for i in range(n) for j in range(n)
                 if i != j and _can_follow(trips_s[i], trips_s[j])]

    print(f"[ortools] trips={n}  can_chain pairs={len(can_chain)}")

    model  = cp_model.CpModel()
    follows = {(i, j): model.new_bool_var(f'f{i}_{j}') for (i, j) in can_chain}

    # At most one successor per trip
    for i in range(n):
        succs = [follows[(i, j)] for (ii, j) in can_chain if ii == i]
        if succs:
            model.add(sum(succs) <= 1)

    # At most one predecessor per trip
    for j in range(n):
        preds = [follows[(i, j)] for (i, jj) in can_chain if jj == j]
        if preds:
            model.add(sum(preds) <= 1)

    # Maximise chaining links → minimise buses
    model.maximize(sum(follows.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    solver.parameters.num_search_workers  = 4
    status = solver.solve(model)

    print(f"[ortools] solver status={status}  OPTIMAL={cp_model.OPTIMAL}  FEASIBLE={cp_model.FEASIBLE}")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("[ortools] falling back to greedy")
        return greedy_scheduler(trips)   # fallback if unsolvable

    # Reconstruct bus schedules from the matching
    active_follows = {(i, j) for (i, j) in follows if solver.value(follows[(i, j)]) == 1}
    succ_map = {i: j for (i, j) in active_follows}
    has_pred = {j for (_, j) in active_follows}

    buses: List[BusSchedule] = []
    bus_counter = 0

    for start in range(n):
        if start in has_pred:
            continue   # not a chain head

        bus_counter += 1
        bus = BusSchedule(bus_id=bus_counter, seats=trips_s[start].seats_needed)
        km_used = 0.0
        idx = start

        while True:
            t = trips_s[idx]
            km_used += t.distance_km
            leg = Leg(
                trip_id=t.trip_id, route_name=t.route_name,
                trip_type=t.trip_type, start_min=t.start_min,
                end_min=t.end_min, distance_km=t.distance_km,
            )

            # Insert charging window if there's a gap before the next trip
            if idx in succ_map:
                next_t = trips_s[succ_map[idx]]
                idle = next_t.start_min - t.end_min
                if idle >= cfg.MIN_CHARGE_WINDOW_MIN:
                    km_rec = min(bus.range_km() - km_used, idle * cfg.CHARGE_RATE_KM_PER_MIN)
                    leg.charge_start = t.end_min + 5
                    leg.charge_end   = next_t.start_min - 5
                    leg.km_charged   = max(0.0, km_rec)
                    km_used = max(0.0, km_used - km_rec)

            bus.legs.append(leg)

            if idx not in succ_map:
                break
            idx = succ_map[idx]

        if km_used > cfg.BUS_TYPES["36seater_3batt"]["range_km_bol"] * 0.92:
            bus.battery_type = "4 Batt"

        buses.append(bus)

    _compute_soc_profiles(buses)
    return OptimizationResult(
        algorithm     = "OR-Tools CP-SAT",
        bus_count     = len(buses),
        total_run_km  = sum(b.run_km for b in buses),
        total_dead_km = sum(b.dead_km for b in buses),
        buses         = buses,
    )


# ─── Post-processing ──────────────────────────────────────────────────────────

def _compute_soc_profiles(buses: List[BusSchedule]) -> None:
    """
    Walk each bus's leg sequence and fill soc_start / soc_end on every leg.
    Uses the continuous approximation: SOC drops linearly with km driven,
    and recovers linearly during the charging window.
    Does NOT change any scheduling decisions — purely informational.
    """
    for bus in buses:
        range_km = bus.range_km()
        soc = float(cfg.SOC_START_PCT)   # e.g. 80.0%

        for leg in bus.legs:
            leg.soc_start = round(soc, 1)
            soc -= (leg.distance_km / range_km) * 100.0
            soc  = max(0.0, soc)
            leg.soc_end = round(soc, 1)

            # Recover SOC during charging window attached to this leg
            if leg.km_charged > 0:
                soc += (leg.km_charged / range_km) * 100.0
                soc  = min(100.0, soc)


def _peak_simultaneous_chargers(buses: List[BusSchedule]) -> int:
    """
    Find the maximum number of buses charging at the same time (1-minute resolution).
    Used to size the charger infrastructure needed.
    """
    if not buses:
        return 0
    events: List[tuple] = []
    for bus in buses:
        for leg in bus.legs:
            if leg.charge_start is not None and leg.charge_end is not None:
                events.append((leg.charge_start, +1))
                events.append((leg.charge_end,   -1))
    if not events:
        return 0
    events.sort()
    peak = current = 0
    for _, delta in events:
        current += delta
        peak = max(peak, current)
    return peak


def _add_opportunistic_charging(buses: List[BusSchedule]) -> None:
    """
    Add charging windows in every idle gap >= MIN_CHARGE_WINDOW_MIN that does
    not already have one.  Reflects real EV depot practice: plug in whenever
    the bus is standing still long enough.
    """
    for bus in buses:
        for i in range(len(bus.legs) - 1):
            leg      = bus.legs[i]
            next_leg = bus.legs[i + 1]
            if leg.charge_start is not None:
                continue                        # already has a window
            idle = next_leg.start_min - leg.end_min
            if idle < cfg.MIN_CHARGE_WINDOW_MIN:
                continue                        # gap too short to bother
            charge_start = leg.end_min + 5
            charge_end   = next_leg.start_min - 5
            leg.charge_start = charge_start
            leg.charge_end   = charge_end
            leg.km_charged   = round(
                (charge_end - charge_start) * cfg.CHARGE_RATE_KM_PER_MIN, 1
            )


def _compute_strategy_comparison(buses: List[BusSchedule]) -> dict:
    """
    Without modifying buses, compute charging logistics under:
    - Full Charge: one depot charge per bus at end of day
    - Opportunity Charging: charge in every idle gap >= MIN_CHARGE_WINDOW_MIN
    Returns metrics to drive the frontend tradeoff table.
    """
    num_buses = len(buses)
    if num_buses == 0:
        return {}

    # ── Full Charge ─────────────────────────────────────────────────────────────
    fc_charge_events_timeline = []
    fc_charge_min_total = 0

    for bus in buses:
        range_km     = bus.range_km()
        soc_end_pct  = max(0.0, cfg.SOC_START_PCT - (bus.run_km / range_km) * 100.0)
        km_to_refill = (100.0 - soc_end_pct) / 100.0 * range_km
        charge_dur   = max(1, int(km_to_refill / cfg.CHARGE_RATE_KM_PER_MIN))
        fc_charge_min_total += charge_dur
        last_end = bus.legs[-1].end_min if bus.legs else 1020
        c_start  = last_end + 10          # ~10 min transit to depot
        fc_charge_events_timeline.append((c_start, c_start + charge_dur))

    fc_dead_km = round(num_buses * 2 * cfg.DEPOT_TO_ROUTE_KM, 1)

    # Peak simultaneous chargers for full charge via sweep line
    fc_peak = 0
    evts = []
    for cs, ce in fc_charge_events_timeline:
        evts.extend([(cs, +1), (ce, -1)])
    evts.sort()
    cur = 0
    for _, d in evts:
        cur += d
        fc_peak = max(fc_peak, cur)

    # ── Opportunity Charging ────────────────────────────────────────────────────
    opp_buses = copy.deepcopy(buses)
    for bus in opp_buses:
        for leg in bus.legs:
            leg.charge_start = None
            leg.charge_end   = None
            leg.km_charged   = 0.0
    _add_opportunistic_charging(opp_buses)

    opp_events     = sum(b.charge_events    for b in opp_buses)
    opp_dead_km    = round(sum(b.charge_dead_km for b in opp_buses), 1)
    opp_charge_min = sum(b.total_charge_min for b in opp_buses)
    opp_peak       = _peak_simultaneous_chargers(opp_buses)

    def _monthly_cost(dead_km: float) -> int:
        return round(dead_km * cfg.WORKING_DAYS_PER_MONTH * cfg.CONTRACT_RATE_INR_PER_KM)

    return {
        "full_charge": {
            "charge_events":            num_buses,
            "dead_km_per_day":          fc_dead_km,
            "total_charge_min":         fc_charge_min_total,
            "peak_chargers_needed":     fc_peak,
            "monthly_dead_km_cost_inr": _monthly_cost(fc_dead_km),
        },
        "opportunity": {
            "charge_events":            opp_events,
            "dead_km_per_day":          opp_dead_km,
            "total_charge_min":         opp_charge_min,
            "peak_chargers_needed":     opp_peak,
            "monthly_dead_km_cost_inr": _monthly_cost(opp_dead_km),
        },
    }


# ─── Utility ──────────────────────────────────────────────────────────────────

def _min_to_hhmm(minutes: int) -> str:
    if minutes is None:
        return ''
    h, m = divmod(int(minutes), 60)
    return f"{h:02d}:{m:02d}"


def compare(*results: OptimizationResult, benchmark_buses: int = 113) -> dict:
    """Return a side-by-side comparison dict for the frontend."""
    def _stats(r):
        saved = benchmark_buses - r.bus_count
        return {
            "algorithm":     r.algorithm,
            "bus_count":     r.bus_count,
            "total_run_km":  round(r.total_run_km, 1),
            "total_km":      round(r.total_km, 1),
            "utilization":   r.avg_utilization_pct,
            "vs_benchmark":  saved,
            "monthly_savings_inr": round(
                max(0, saved) * cfg.PARKING_DEAD_KM_PER_BUS *
                cfg.CONTRACT_RATE_INR_PER_KM * cfg.WORKING_DAYS_PER_MONTH, 0
            ),
        }
    keys   = ['greedy', 'pairing', 'ortools']
    output = {"benchmark_buses": benchmark_buses}
    for key, r in zip(keys, results):
        output[key] = _stats(r)
    return output
