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

// Chart instance and gesture state
let chart;
let initialPinchDistance = 0;
let isPinching = false;
let lastPinchScale = 1;

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
function setupTouchGestures(canvas) {
  // Touch events for pinch-to-zoom
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  
  // Double-tap to reset zoom
  let lastTap = 0;
  canvas.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    
    if (tapLength < 300 && tapLength > 0 && e.touches.length === 0) {
      // Double-tap detected
      if (chart && chart.resetZoom) {
        chart.resetZoom();
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
    
    lastPinchScale = 1;
    
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
    
    // Calculate the center point between fingers
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    if (initialPinchDistance > 0) {
      // Calculate scale factor (current distance / initial distance)
      const scaleFactor = currentDistance / initialPinchDistance;
      
      // Calculate zoom amount (1 = no zoom, >1 = zoom in, <1 = zoom out)
      let zoomAmount;
      
      if (scaleFactor > lastPinchScale) {
        // Fingers moving apart = ZOOM IN (expand)
        zoomAmount = 1.05; // Slight zoom in
      } else if (scaleFactor < lastPinchScale) {
        // Fingers moving together = ZOOM OUT (de-expand)
        zoomAmount = 0.95; // Slight zoom out
      } else {
        zoomAmount = 1; // No change
      }
      
      // Convert screen coordinates to chart coordinates
      const chartArea = chart.chartArea;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      
      const xValue = xScale.getValueForPixel(centerX);
      const yValue = yScale.getValueForPixel(centerY);
      
      // Apply zoom
      if (chart.zoom) {
        chart.zoom({
          x: zoomAmount,
          y: zoomAmount
        }, {
          x: xValue,
          y: yValue
        });
      }
      
      lastPinchScale = scaleFactor;
    }
    
    e.preventDefault();
  }
}

function handleTouchEnd(e) {
  if (e.touches.length < 2) {
    isPinching = false;
    initialPinchDistance = 0;
    lastPinchScale = 1;
  }
}

// --------------------
// Enhanced Pinch-to-Zoom (Alternative implementation)
// --------------------
function setupEnhancedPinchZoom(canvas) {
  let initialDistance = null;
  let initialScale = { x: 1, y: 1 };
  
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      initialDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // Store initial zoom state
      if (chart && chart.scales) {
        initialScale.x = chart.scales.x.max - chart.scales.x.min;
        initialScale.y = chart.scales.y.max - chart.scales.y.min;
      }
    }
  });
  
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialDistance !== null && chart) {
      e.preventDefault();
      
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // Calculate zoom factor
      // If currentDistance > initialDistance = ZOOM IN (expand)
      // If currentDistance < initialDistance = ZOOM OUT (de-expand)
      const zoomFactor = currentDistance / initialDistance;
      
      // Center point for zoom
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      // Apply zoom based on factor
      if (zoomFactor > 1.02) {
        // Significant spread = Zoom in
        applyManualZoom(1.1, centerX, centerY);
        initialDistance = currentDistance; // Reset reference
      } else if (zoomFactor < 0.98) {
        // Significant pinch = Zoom out
        applyManualZoom(0.9, centerX, centerY);
        initialDistance = currentDistance; // Reset reference
      }
    }
  });
  
  canvas.addEventListener('touchend', () => {
    initialDistance = null;
  });
}

function applyManualZoom(zoomFactor, centerX, centerY) {
  if (!chart || !chart.scales) return;
  
  const xScale = chart.scales.x;
  const yScale = chart.scales.y;
  
  // Get the data value at the center point
  const centerXValue = xScale.getValueForPixel(centerX);
  const centerYValue = yScale.getValueForPixel(centerY);
  
  // Calculate new ranges
  const xRange = xScale.max - xScale.min;
  const yRange = yScale.max - yScale.min;
  
  const newXRange = xRange * zoomFactor;
  const newYRange = yRange * zoomFactor;
  
  // Calculate new min/max centered on the pinch center
  const newXMin = centerXValue - (newXRange / 2);
  const newXMax = centerXValue + (newXRange / 2);
  const newYMin = centerYValue - (newYRange / 2);
  const newYMax = centerYValue + (newYRange / 2);
  
  // Update the scales
  xScale.min = newXMin;
  xScale.max = newXMax;
  yScale.min = newYMin;
  yScale.max = newYMax;
  
  // Update the chart
  chart.update('none');
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
      pointHoverRadius: pointHoverRadius,
      pointHoverBorderWidth: 2
    };
  });

  const ctx = document.getElementById("myChart").getContext("2d");

  if (chart) chart.destroy();

  // Remove loading indicator
  const loading = document.querySelector('.loading');
  if (loading) loading.style.display = 'none';

  // Check if zoom plugin is available
  const zoomPluginAvailable = typeof Chart.Zoom !== 'undefined';
  
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
          grid: { display: true },
          min: Math.min(...days),
          max: Math.max(...days)
        },
        y: {
          title: { display: true, text: "Values", font: { size: 14 } },
          beginAtZero: false,
          grace: '10%'
        }
      },
      plugins: zoomPluginAvailable ? {
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
              speed: 0.05 // Slower zoom for better control
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
            scaleMode: 'xy'
          },
          pan: {
            enabled: true,
            mode: 'xy',
            scaleMode: 'xy'
          },
          limits: {
            x: { 
              min: Math.min(...days),
              max: Math.max(...days),
              minRange: 1 // Minimum zoom level (1 day)
            },
            y: { 
              min: 'original',
              max: 'original',
              minRange: 0.1 // Minimum zoom level for Y
            }
          }
        }
      } : {
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
        mode: 'nearest'
      },
      animation: {
        duration: 300,
        easing: 'easeOutQuart'
      }
    },
    plugins: zoomPluginAvailable ? [Chart.Zoom] : []
  });

  // Setup gesture handlers
  if (zoomPluginAvailable) {
    // Use Chart.js built-in pinch zoom
    setupTouchGestures(ctx.canvas);
  } else {
    // Use enhanced custom pinch zoom
    setupEnhancedPinchZoom(ctx.canvas);
    
    // Double-click to reset (desktop)
    ctx.canvas.addEventListener('dblclick', () => {
      if (chart && chart.options && chart.options.scales) {
        chart.options.scales.x.min = Math.min(...days);
        chart.options.scales.x.max = Math.max(...days);
        chart.update();
      }
    });
  }

  // Add visual feedback for pinch gesture
  addPinchVisualFeedback();
}

function addPinchVisualFeedback() {
  // Add a subtle animation class to canvas when pinching
  const canvas = document.getElementById('myChart');
  
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      canvas.style.transition = 'transform 0.1s';
      canvas.style.transform = 'scale(0.99)';
    }
  });
  
  canvas.addEventListener('touchend', () => {
    canvas.style.transform = 'scale(1)';
    setTimeout(() => {
      canvas.style.transition = '';
    }, 100);
  });
}

// Initialize
buildGraph();

// Update gesture hint text
setTimeout(() => {
  const hint = document.querySelector('.gesture-hint');
  if (hint) {
    hint.textContent = 'Pinch together to zoom out • Spread apart to zoom in • Drag to pan';
  }
}, 1000);
