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
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let originalXMin, originalXMax, originalYMin, originalYMax;

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
// Enhanced Zoom and Pan Functions
// --------------------
function setupEnhancedControls(canvas) {
  let initialPinchDistance = 0;
  let initialTouches = [];
  let lastPinchCenter = { x: 0, y: 0 };
  let isPinching = false;

  // Mouse wheel zoom
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Mouse drag for panning
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);

  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

  // Double-click/tap to reset
  canvas.addEventListener('dblclick', handleDoubleClick);
  
  let lastTapTime = 0;
  canvas.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    if (currentTime - lastTapTime < 300) {
      handleDoubleClick();
      e.preventDefault();
    }
    lastTapTime = currentTime;
  }, { passive: false });

  function handleWheel(e) {
    if (!chart) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Scroll down = zoom out, up = zoom in
    zoomAtPoint(x, y, zoomFactor);
  }

  function handleMouseDown(e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    canvas.style.cursor = 'grabbing';
  }

  function handleMouseMove(e) {
    if (!isDragging || !chart) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      panChart(-deltaX, -deltaY);
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
  }

  function handleMouseUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      // Start dragging
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      initialTouches = [e.touches[0]];
    } else if (e.touches.length === 2) {
      // Start pinch zoom
      isPinching = true;
      isDragging = false;
      initialTouches = [e.touches[0], e.touches[1]];
      initialPinchDistance = getDistance(initialTouches[0], initialTouches[1]);
      lastPinchCenter = getCenterPoint(initialTouches[0], initialTouches[1]);
    }
    e.preventDefault();
  }

  function handleTouchMove(e) {
    if (!chart) return;
    
    if (isPinching && e.touches.length === 2) {
      // Handle pinch zoom
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const currentCenter = getCenterPoint(e.touches[0], e.touches[1]);
      
      if (initialPinchDistance > 0) {
        const zoomFactor = currentDistance / initialPinchDistance;
        
        // Convert screen center to chart coordinates
        const rect = canvas.getBoundingClientRect();
        const chartX = currentCenter.x - rect.left;
        const chartY = currentCenter.y - rect.top;
        
        // Apply zoom
        zoomAtPoint(chartX, chartY, zoomFactor);
        
        // Update reference for continuous zoom
        initialPinchDistance = currentDistance;
        lastPinchCenter = currentCenter;
      }
    } else if (isDragging && e.touches.length === 1) {
      // Handle drag panning
      const deltaX = e.touches[0].clientX - dragStartX;
      const deltaY = e.touches[0].clientY - dragStartY;
      
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        panChart(-deltaX, -deltaY);
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
      }
    }
    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (e.touches.length === 0) {
      isDragging = false;
      isPinching = false;
      initialPinchDistance = 0;
      initialTouches = [];
    } else if (e.touches.length === 1) {
      // Transition from pinch to single touch
      isPinching = false;
      isDragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
    }
  }

  function handleDoubleClick() {
    resetZoom();
  }

  function getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getCenterPoint(touch1, touch2) {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }
}

function zoomAtPoint(screenX, screenY, zoomFactor) {
  if (!chart || !chart.scales) return;
  
  const xScale = chart.scales.x;
  const yScale = chart.scales.y;
  
  // Get the data value at the click/touch point
  const xValue = xScale.getValueForPixel(screenX);
  const yValue = yScale.getValueForPixel(screenY);
  
  if (xValue === null || yValue === null) return;
  
  // Calculate new ranges
  const xRange = xScale.max - xScale.min;
  const yRange = yScale.max - yScale.min;
  
  const newXRange = xRange * zoomFactor;
  const newYRange = yRange * zoomFactor;
  
  // Calculate new min/max centered on the point
  const newXMin = xValue - (newXRange * (xValue - xScale.min) / xRange);
  const newXMax = newXMin + newXRange;
  
  const newYMin = yValue - (newYRange * (yValue - yScale.min) / yRange);
  const newYMax = newYMin + newYRange;
  
  // Apply limits (don't zoom beyond original data)
  const finalXMin = Math.max(newXMin, originalXMin);
  const finalXMax = Math.min(newXMax, originalXMax);
  const finalYMin = Math.max(newYMin, originalYMin);
  const finalYMax = Math.min(newYMax, originalYMax);
  
  // Update scales
  xScale.min = finalXMin;
  xScale.max = finalXMax;
  yScale.min = finalYMin;
  yScale.max = finalYMax;
  
  // Update the chart
  chart.update('none');
}

function panChart(deltaX, deltaY) {
  if (!chart || !chart.scales) return;
  
  const xScale = chart.scales.x;
  const yScale = chart.scales.y;
  
  // Convert pixel delta to data delta
  const xPixelRange = xScale.max - xScale.min;
  const yPixelRange = yScale.max - yScale.min;
  
  const chartWidth = chart.chartArea.right - chart.chartArea.left;
  const chartHeight = chart.chartArea.bottom - chart.chartArea.top;
  
  const xDataDelta = (deltaX / chartWidth) * xPixelRange;
  const yDataDelta = (deltaY / chartHeight) * yPixelRange;
  
  // Calculate new bounds
  let newXMin = xScale.min + xDataDelta;
  let newXMax = xScale.max + xDataDelta;
  let newYMin = yScale.min + yDataDelta;
  let newYMax = yScale.max + yDataDelta;
  
  // Apply boundaries (don't pan beyond original data)
  if (newXMin < originalXMin) {
    const diff = originalXMin - newXMin;
    newXMin += diff;
    newXMax += diff;
  }
  if (newXMax > originalXMax) {
    const diff = newXMax - originalXMax;
    newXMin -= diff;
    newXMax -= diff;
  }
  
  if (newYMin < originalYMin) {
    const diff = originalYMin - newYMin;
    newYMin += diff;
    newYMax += diff;
  }
  if (newYMax > originalYMax) {
    const diff = newYMax - originalYMax;
    newYMin -= diff;
    newYMax -= diff;
  }
  
  // Update scales
  xScale.min = newXMin;
  xScale.max = newXMax;
  yScale.min = newYMin;
  yScale.max = newYMax;
  
  chart.update('none');
}

function resetZoom() {
  if (!chart || !chart.scales) return;
  
  chart.scales.x.min = originalXMin;
  chart.scales.x.max = originalXMax;
  chart.scales.y.min = originalYMin;
  chart.scales.y.max = originalYMax;
  chart.update();
}

// --------------------
// Build Graph
// --------------------
async function buildGraph() {
  const data = await processGraphData();

  const days = Object.keys(data)
    .map((d) => Number(d))
    .sort((a, b) => a - b);

  if (days.length === 0) {
    const loading = document.querySelector('.loading');
    if (loading) loading.textContent = 'No data available for selected month';
    return;
  }

  // Store original bounds
  originalXMin = Math.min(...days);
  originalXMax = Math.max(...days);
  
  // Calculate Y bounds from data
  const allValues = [];
  elements.forEach(el => {
    days.forEach(day => {
      const vals = data[day]?.[el] || [];
      vals.forEach(v => allValues.push(v));
    });
  });
  
  originalYMin = Math.min(...allValues);
  originalYMax = Math.max(...allValues);
  
  // Add some padding to Y axis
  const yPadding = (originalYMax - originalYMin) * 0.1;
  originalYMin -= yPadding;
  originalYMax += yPadding;

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
      label: el.charAt(0).toUpperCase() + el.slice(1),
      data: days.map((day) => {
        const vals = data[day]?.[el] || [];
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }),
      borderColor: colorMap[el] || "#000",
      backgroundColor: colorMap[el] + "20" || "#00000020",
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      pointRadius: pointRadius,
      pointHoverRadius: pointHoverRadius,
      pointBackgroundColor: colorMap[el] || "#000",
      pointBorderColor: '#fff',
      pointBorderWidth: 1
    };
  });

  const ctx = document.getElementById("myChart").getContext("2d");

  if (chart) chart.destroy();

  // Remove loading indicator
  const loading = document.querySelector('.loading');
  if (loading) loading.style.display = 'none';

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
          title: { 
            display: true, 
            text: "Day of Month", 
            font: { 
              size: 14,
              weight: 'bold'
            },
            padding: { top: 10 }
          },
          grid: { 
            display: true,
            color: 'rgba(0,0,0,0.05)'
          },
          min: originalXMin,
          max: originalXMax,
          ticks: {
            autoSkip: true,
            maxTicksLimit: 15
          }
        },
        y: {
          title: { 
            display: true, 
            text: "Values", 
            font: { 
              size: 14,
              weight: 'bold'
            },
            padding: { bottom: 10 }
          },
          beginAtZero: false,
          grid: { 
            display: true,
            color: 'rgba(0,0,0,0.05)'
          },
          min: originalYMin,
          max: originalYMax,
          ticks: {
            callback: function(value) {
              return Number(value.toFixed(2));
            }
          }
        }
      },
      plugins: {
        legend: { 
          position: "top",
          labels: {
            padding: 20,
            font: {
              size: 12,
              weight: 'bold'
            },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 6
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
    }
  });

  // Setup enhanced controls
  setupEnhancedControls(ctx.canvas);
  
  // Set initial cursor
  ctx.canvas.style.cursor = 'grab';
}

// Initialize
buildGraph();

// Update gesture hint
setTimeout(() => {
  const hint = document.querySelector('.gesture-hint');
  if (hint) {
    hint.innerHTML = `
      <div>• <strong>Pinch spread</strong> to zoom in anywhere</div>
      <div>• <strong>Pinch together</strong> to zoom out anywhere</div>
      <div>• <strong>Drag</strong> to move left/right/up/down</div>
      <div>• <strong>Scroll</strong> to zoom in/out (desktop)</div>
      <div>• <strong>Double-tap/click</strong> to reset view</div>
    `;
  }
}, 500);
