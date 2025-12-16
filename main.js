// --------------------
// URL Parameters
// --------------------
const url = new URL(window.location.href);
const user = url.searchParams.get("user");
const month = url.searchParams.get("month");
const elements = url.searchParams.get("elements")?.split(",").map(e => e.trim().toLowerCase()) || [];

// Firebase URL
const firebaseBase =
  "https://soilbitchina-default-rtdb.firebaseio.com/Users/" +
  user +
  "/Farm/Nodes";

// Chart instance
let chart;

// Fixed colors per element
const colorMap = {
  moisture: "#1E88E5",
  ph: "#D81B60",
  temperature: "#F4511E",
  ec: "#6A1B9A",
  nitrogen: "#00897B",
  phosphorus: "#3949AB",
  potassium: "#7CB342",
  salinity: "#5D4037"
};

// --------------------
// Fetch all nodes for selected user
// --------------------
async function getAllNodeData() {
  const res = await fetch(firebaseBase + ".json");
  const data = await res.json();
  return data || {};
}

// --------------------
// Process & average data
// --------------------
async function processGraphData() {
  const nodes = await getAllNodeData();

  // day → element → list of values
  const monthData = {};

  for (let nodeName in nodes) {
    const node = nodes[nodeName];
    if (!node.Packets) continue;

    for (let timestamp in node.Packets) {
      const p = node.Packets[timestamp];

      const ts = new Date(p.timestamp);
      const pktMonth = String(ts.getMonth() + 1).padStart(2, "0");
      const pktDay = ts.getDate();

      if (pktMonth !== month) continue;

      if (!monthData[pktDay]) monthData[pktDay] = {};

      elements.forEach((el) => {
        // Case-insensitive key finder
        const firebaseKey = Object.keys(p).find(
          (k) => k.toLowerCase() === el.toLowerCase()
        );

        if (firebaseKey) {
          if (!monthData[pktDay][el]) monthData[pktDay][el] = [];
          monthData[pktDay][el].push(Number(p[firebaseKey]));
        }
      });
    }
  }

  return monthData;
}

// --------------------
// Build Graph
// --------------------
async function buildGraph() {
  const data = await processGraphData();

  const days = Object.keys(data)
    .map((d) => Number(d))
    .sort((a, b) => a - b);

  // Create datasets
  const datasets = elements.map((el) => {
    // Set different point sizes for EC and salinity
    let pointRadius = 2; // Default size for other elements
    let pointHoverRadius = 4; // Default hover size
    
    if (el === 'ec') {
      pointRadius = 5; // Bigger points for EC
      pointHoverRadius = 7;
    } else if (el === 'salinity') {
      pointRadius = 2; // Smaller points for salinity
      pointHoverRadius = 4;
    }

    return {
      label: el,
      data: days.map((day) => {
        const vals = data[day]?.[el] || [];
        if (vals.length === 0) return null;

        // Average (no vertical separation)
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }),
      borderColor: colorMap[el] || "#000",
      backgroundColor: colorMap[el] || "#000",
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      pointRadius: pointRadius,
      pointHoverRadius: pointHoverRadius
    };
  });

  const ctx = document.getElementById("myChart").getContext("2d");

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: days,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Day of Month" },
          grid: { display: true }
        },
        y: {
          title: { display: true, text: "Values" },
          beginAtZero: false,
          grace: 10
        }
      },
      plugins: {
        legend: { position: "top" }
      }
    }
  });
}

buildGraph();
