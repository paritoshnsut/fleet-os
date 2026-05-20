const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const drivers   = require('./data/drivers');
const routes    = require('./data/routes');
const { initBusStates, initBusStatesFromFleet, tickBusStates, calcDriverScore } = require('./utils/telemetry');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ── State ─────────────────────────────────────────────────────────────────────
let busStates = initBusStates(drivers);

// Tick telemetry every 2 seconds
setInterval(() => {
  busStates = tickBusStates(busStates);

  // Broadcast to all connected WS clients
  const payload = JSON.stringify({ type: "telemetry", buses: busStates });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 2000);

// ── REST Endpoints ────────────────────────────────────────────────────────────

// Current snapshot of all buses
app.get('/api/buses', (req, res) => {
  const enriched = busStates.map(bus => ({
    ...bus,
    driverScore: calcDriverScore(bus),
  }));
  res.json(enriched);
});

// Single bus detail
app.get('/api/buses/:busId', (req, res) => {
  const bus = busStates.find(b => b.busId === req.params.busId);
  if (!bus) return res.status(404).json({ error: 'Bus not found' });
  res.json({ ...bus, driverScore: calcDriverScore(bus) });
});

// All drivers with scores — derived from live busStates so count always matches Fleet Setup
app.get('/api/drivers', (req, res) => {
  const result = busStates.map((bus, i) => ({
    id:           bus.driverId,
    name:         bus.driverName || 'Unassigned',
    busId:        bus.busId,
    routeId:      bus.routeId,
    routeName:    bus.routeName,
    routeNo:      bus.routeNo,
    age:          30 + (i * 7 % 20),
    experience:   3  + (i * 5 % 18),
    score:        calcDriverScore(bus),
    harshBraking: bus.harshBrakingCount || 0,
    harshAccel:   bus.harshAccelCount   || 0,
    overspeed:    bus.overspeedCount    || 0,
    kmToday:      bus.kmToday           || 0,
    speed:        bus.speed             || 0,
  }));
  result.sort((a, b) => b.score - a.score);
  res.json(result);
});

// Routes metadata
app.get('/api/routes', (req, res) => {
  const result = Object.entries(routes).map(([id, r]) => ({
    id,
    ...r,
    bus: busStates.find(b => b.routeId === id),
  }));
  res.json(result);
});

// GCC Compliance data
app.get('/api/gcc', (req, res) => {
  const contractedKm = 180;
  const result = busStates.map(bus => {
    const compliance = bus.kmToday / contractedKm;
    const lastPaymentDays = Math.floor(Math.random() * 45);
    return {
      busId:         bus.busId,
      routeNo:       bus.routeNo,
      routeName:     bus.routeName,
      driverName:    bus.driverName,
      kmToday:       bus.kmToday,
      contractedKm,
      compliancePct: Math.round(compliance * 100),
      revenueToday:  Math.round(bus.kmToday * 80),
      psmStatus:     lastPaymentDays > 30 ? "OVERDUE" : "OK",
      lastPaymentDays,
      fuelType:      bus.fuelType,
    };
  });
  res.json(result);
});

// SafeRide: Students per bus (mock manifest)
app.get('/api/saferide/students', (req, res) => {
  const students = [
    { id: "S001", name: "Arjun Mehta",    busId: "MH12-AB-1234", stop: "Aundh",       boardingTime: "07:42", status: "boarded"  },
    { id: "S002", name: "Priya Sharma",   busId: "MH12-AB-1234", stop: "Wakad",       boardingTime: "07:55", status: "boarded"  },
    { id: "S003", name: "Rohan Desai",    busId: "MH12-AB-1234", stop: "Hinjewadi",   boardingTime: null,    status: "pending"  },
    { id: "S004", name: "Ananya Joshi",   busId: "MH12-CD-5678", stop: "Yerwada",     boardingTime: "07:38", status: "boarded"  },
    { id: "S005", name: "Kabir Singh",    busId: "MH12-CD-5678", stop: "Nagar Road",  boardingTime: null,    status: "absent"   },
    { id: "S006", name: "Sneha Kulkarni", busId: "MH12-EF-9012", stop: "Kothrud",     boardingTime: "07:45", status: "boarded"  },
    { id: "S007", name: "Dev Patil",      busId: "MH12-EF-9012", stop: "Karve Road",  boardingTime: "07:51", status: "boarded"  },
    { id: "S008", name: "Isha Wagh",      busId: "MH12-GH-3456", stop: "Pimpri",      boardingTime: null,    status: "pending"  },
    { id: "S009", name: "Advait Nair",    busId: "MH12-IJ-7890", stop: "Wagholi",     boardingTime: "07:33", status: "boarded"  },
    { id: "S010", name: "Mira Jain",      busId: "MH12-IJ-7890", stop: "Kharadi",     boardingTime: "07:44", status: "boarded"  },
  ];
  res.json(students);
});

// ONDC: Bus arrivals at a stop
app.get('/api/ondc/arrivals', (req, res) => {
  const { stop } = req.query;
  const arrivals = busStates.slice(0, 4).map((bus, i) => ({
    routeNo:     bus.routeNo,
    routeName:   bus.routeName,
    busId:       bus.busId,
    eta:         `${3 + i * 4} mins`,
    speed:       bus.speed,
    passengers:  bus.passengerLoad,
    fuelType:    bus.fuelType,
  }));
  res.json(arrivals);
});

// Reload bus states from Fleet Setup (Supabase data pushed by the frontend)
app.post('/api/reload-buses', (req, res) => {
  const { buses, drivers: fleetDrivers } = req.body;
  if (!Array.isArray(buses) || buses.length === 0) {
    return res.status(400).json({ error: 'buses array required' });
  }
  busStates = initBusStatesFromFleet(buses, fleetDrivers || []);
  console.log(`Fleet reloaded: ${busStates.length} buses`);
  res.json({ ok: true, count: busStates.length });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', buses: busStates.length }));

// ── WebSocket connection ───────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('Client connected');
  // Send current state immediately on connect
  ws.send(JSON.stringify({ type: "telemetry", buses: busStates }));

  ws.on('close', () => console.log('Client disconnected'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Fleet Intelligence server running on port ${PORT}`);
  console.log(`WebSocket ready — tracking ${busStates.length} buses`);
});