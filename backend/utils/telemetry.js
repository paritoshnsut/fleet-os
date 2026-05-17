const routes = require('../data/routes');

// Interpolate smoothly between two GPS points
function interpolate(from, to, fraction) {
  return {
    lat: from.lat + (to.lat - from.lat) * fraction,
    lng: from.lng + (to.lng - from.lng) * fraction,
  };
}

// Add tiny random jitter so buses don't move robotically
function jitter(val, amount = 0.0003) {
  return val + (Math.random() - 0.5) * amount;
}

// Initialize state for each bus
function initBusStates(drivers) {
  return drivers.map((driver, i) => {
    const route = routes[driver.routeId];
    return {
      busId: driver.busId,
      driverId: driver.id,
      driverName: driver.name,
      routeId: driver.routeId,
      routeName: route.name,
      routeNo: route.routeNo,
      stopIndex: 0,
      fraction: Math.random(), // start at random point along route
      direction: 1,            // 1 = forward, -1 = reverse
      speed: 28 + Math.random() * 15,
      status: "moving",        // moving | stopped | breakdown
      fuelType: i < 5 ? "Electric" : "CNG",
      soc: i < 5 ? 60 + Math.random() * 35 : null,      // battery %
      engineTemp: 75 + Math.random() * 20,
      passengerLoad: Math.floor(20 + Math.random() * 40),
      kmToday: Math.floor(40 + Math.random() * 60),
      harshBrakingCount: 0,
      harshAccelCount: 0,
      overspeedCount: 0,
      lastAlert: null,
    };
  });
}

// Tick: advance each bus one step along its route
function tickBusStates(busStates) {
  return busStates.map(bus => {
    const route = routes[bus.routeId];
    const stops = route.stops;
    const nextStop = bus.stopIndex + bus.direction;

    // Reverse direction at end of route
    let direction = bus.direction;
    let stopIndex = bus.stopIndex;

    if (nextStop >= stops.length) {
      direction = -1;
      stopIndex = stops.length - 1;
    } else if (nextStop < 0) {
      direction = 1;
      stopIndex = 0;
    }

    // Advance fraction toward next stop
    let fraction = bus.fraction + 0.018 + Math.random() * 0.012;
    if (fraction >= 1) {
      fraction = 0;
      stopIndex = stopIndex + direction;
      // Clamp
      if (stopIndex >= stops.length) stopIndex = stops.length - 2;
      if (stopIndex < 0) stopIndex = 1;
    }

    // Current position
    const fromStop = stops[Math.max(0, stopIndex)];
    const toStop   = stops[Math.min(stops.length - 1, stopIndex + direction)];
    const pos      = interpolate(fromStop, toStop, fraction);

    // Simulate speed variation
    let speed = bus.speed + (Math.random() - 0.5) * 8;
    speed = Math.max(0, Math.min(85, speed));

    // Randomly trigger events
    let harshBrakingCount = bus.harshBrakingCount;
    let harshAccelCount   = bus.harshAccelCount;
    let overspeedCount    = bus.overspeedCount;
    let lastAlert         = null;

    if (speed > 70) {
      overspeedCount++;
      lastAlert = { type: "overspeed", message: `${bus.routeNo} overspeed: ${Math.round(speed)} km/h`, severity: "high" };
    } else if (Math.random() < 0.04) {
      harshBrakingCount++;
      lastAlert = { type: "harshBraking", message: `${bus.routeNo} harsh braking detected`, severity: "medium" };
    } else if (Math.random() < 0.03) {
      harshAccelCount++;
      lastAlert = { type: "harshAccel", message: `${bus.routeNo} harsh acceleration detected`, severity: "low" };
    }

    // Update km driven
    const kmToday = bus.kmToday + 0.04;

    // Update SOC for EVs
    const soc = bus.soc !== null ? Math.max(15, bus.soc - 0.015) : null;

    // Engine temp variation
    const engineTemp = Math.min(105, Math.max(65, bus.engineTemp + (Math.random() - 0.48) * 2));

    // Passenger load changes at stops
    const atStop = fraction < 0.05;
    const passengerLoad = atStop
      ? Math.max(5, Math.min(55, bus.passengerLoad + Math.floor((Math.random() - 0.5) * 15)))
      : bus.passengerLoad;

    return {
      ...bus,
      lat: jitter(pos.lat),
      lng: jitter(pos.lng),
      stopIndex,
      fraction,
      direction,
      speed: Math.round(speed),
      kmToday: Math.round(kmToday * 10) / 10,
      soc,
      engineTemp: Math.round(engineTemp),
      passengerLoad,
      harshBrakingCount,
      harshAccelCount,
      overspeedCount,
      lastAlert,
      nextStop: stops[Math.min(stops.length - 1, stopIndex + direction)]?.name,
      currentStop: atStop ? fromStop.name : null,
      timestamp: new Date().toISOString(),
    };
  });
}

// Calculate driver score from telemetry (0–100)
function calcDriverScore(bus) {
  let score = 100;
  score -= bus.harshBrakingCount * 3;
  score -= bus.harshAccelCount * 2;
  score -= bus.overspeedCount * 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { initBusStates, tickBusStates, calcDriverScore };