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
// Touch/Pinch Gesture Handling
// --------------------
let initialPinchDistance = 0;
let isPinching = false;
let lastTouchCenter = { x: 0, y: 0 };

function setupTouchGestures(canvas) {
  // Touch events for pinch-to-zoom
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  // Double-tap to reset zoom
  let lastTap = 0;
  canvas.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    
    if (tapLength < 300 && tapLength > 0 && e.touches.length === 0) {
      // Double-tap detected
      if (chart) {
        chart.resetZoom();
        chart.reset();
      }
      e.preventDefault();
    }
    lastTap = currentTime;
  }, { passive: false });
}

function handleTouchStart(e) {
  if (e.touches.length === 2 && chart) {
    isPinching = true;
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    initialPinchDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    
    lastTouchCenter = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
    
    e.preventDefault();
  }
}

function handleTouchMove(e) {
  if (e.touches.length === 2 && chart && isPinching) {
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const currentDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    if (initialPinchDistance > 0) {
      const scaleFactor = currentDistance / initialPinchDistance;
      
      // Convert screen coordinates to chart coordinates
      const chartArea = chart.chartArea;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      
      const xValue = xScale.getValueForPixel(centerX);
      const yValue = yScale.getValueForPixel(centerY);
      
      // Apply zoom
      chart.zoom({
        x: scaleFactor,
        y: scaleFactor
      }, {
        x: xValue,
        y: yValue
      });
      
      initialPinchDistance = currentDistance;
    }
    
    e.preventDefault();
  }
}

function handleTouchEnd(e) {
  if (e.touches.length < 2) {
    isPinching = false;
    initialPinchDistance = 0;
  }
}

// --------------------
// Build Graph with Zoom/Pan
// --------------------
async function buildGraph() {
  const data = await processGraphData();

  const days = Object.keys(data)
    .map((d) => Number(d))
    .sort((a, b) => a - b);

  // Create datasets
  const datasets = elements.map((el) => {
    let pointRadius = 2;
    let pointHoverRadius = 4;
    
    if (el === 'ec') {
      pointRadius = 5;
      pointHoverRadius = 7;
    } else if (el === 'salinity') {
      pointRadius = 2;
      pointHoverRadius = 4;
    }

    return {
      label: el,
      data: days.map((day) => {
        const vals = data[day]?.[el] || [];
        if (vals.length === 0) return null;
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

  // Remove loading indicator
  const loading = document.querySelector('.loading');
  if (loading) loading.style.display = 'none';

  // Check if zoom plugin is available
  if (typeof Chart.Zoom === 'undefined') {
    console.warn('Chart.js zoom plugin not loaded. Using native gestures only.');
    initializeBasicChart();
  } else {
    initializeZoomChart();
  }

  function initializeBasicChart() {
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
            title: { display: true, text: "Day of Month", font: { size: 14 } },
            grid: { display: true }
          },
          y: {
            title: { display: true, text: "Values", font: { size: 14 } },
            beginAtZero: false,
            grace: '10%'
          }
        },
        plugins: {
          legend: { 
            position: "top",
            labels: {
              padding: 20,
              font: {
                size: 14
              }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
    
    // Setup touch gestures
    setupTouchGestures(ctx.canvas);
    
    // Double-click to reset (desktop)
    ctx.canvas.addEventListener('dblclick', () => {
      chart.reset();
    });
  }

  function initializeZoomChart() {
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
            title: { display: true, text: "Day of Month", font: { size: 14 } },
            grid: { display: true }
          },
          y: {
            title: { display: true, text: "Values", font: { size: 14 } },
            beginAtZero: false,
            grace: '10%'
          }
        },
        plugins: {
          legend: { 
            position: "top",
            labels: {
              padding: 20,
              font: {
                size: 14
              }
            }
          },
          zoom: {
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.1
              },
              pinch: {
                enabled: true
              },
              mode: 'xy',
              drag: {
                enabled: false // We'll use pan for drag
              }
            },
            pan: {
              enabled: true,
              mode: 'xy',
              modifierKey: null,
              threshold: 10
            },
            limits: {
              x: { min: 'original', max: 'original' },
              y: { min: 'original', max: 'original' }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      },
      plugins: [Chart.Zoom]
    });

    // Double-click to reset zoom
    ctx.canvas.addEventListener('dblclick', () => {
      chart.resetZoom();
    });

    // Setup additional touch gestures for pinch-to-zoom
    setupTouchGestures(ctx.canvas);
  }
}

// Initialize the graph
buildGraph();
