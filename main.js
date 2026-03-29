let globalLocationFilter = null;
const chartRoot = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const experienceFilter = d3.select("#experienceFilter");
const yearFilter = d3.select("#yearFilter");

const chartWidth = 980;
const chartHeight = 560;
const margin = { top: 40, right: 24, bottom: 120, left: 80 };
const innerWidth = chartWidth - margin.left - margin.right;
const innerHeight = chartHeight - margin.top - margin.bottom;

const svg = chartRoot
  .append("svg")
  .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

const g = svg
  .append("g")
  .attr("transform", `translate(${margin.left}, ${margin.top})`);

const gridG = g.append("g").attr("class", "grid");
const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0, ${innerHeight})`);
const yAxisG = g.append("g").attr("class", "axis");

const titleText = svg
  .append("text")
  .attr("x", margin.left)
  .attr("y", 24)
  .attr("font-size", 16)
  .attr("font-weight", 600)
  .attr("fill", "#e0e0e0")
  .text("Average Salary by Job Title");

const xLabel = svg
  .append("text")
  .attr("x", margin.left + innerWidth / 2)
  .attr("y", chartHeight - 16)
  .attr("text-anchor", "middle")
  .attr("fill", "#a0a0a0")
  .attr("font-size", 12)
  .text("Job Title (Top 12 by average salary)");

const yLabel = svg
  .append("text")
  .attr("x", -(margin.top + innerHeight / 2))
  .attr("y", 20)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .attr("fill", "#a0a0a0")
  .attr("font-size", 12)
  .text("Average Salary (USD)");

const xScale = d3.scaleBand().range([0, innerWidth]).padding(0.18);
const yScale = d3.scaleLinear().range([innerHeight, 0]);

const usdFormatter = d3.format("$,.0f");

const pileLayer = g.append("g").attr("class", "pile-layer");
const moneyRainLayer = g.append("g").attr("class", "money-rain-layer");

let activeMoneyRain = {
  timerId: null,
  jobTitle: null,
  accumulatedHeight: 0,
  maxStackHeight: 0,
  barTopY: 0
};

// label map for experience codes
const experienceLabelMap = {
  EN: "Entry-level",
  MI: "Mid-level",
  SE: "Senior-level",
  EX: "Executive-level",
};

function buildAggregates(rows) {
  const grouped = d3.rollup(
    rows,
    (values) => ({
      avgSalary: d3.mean(values, (d) => d.salary_in_usd),
      count: values.length,
    }),
    (d) => d.work_year,
    (d) => d.experience_level,
    (d) => d.job_title
  );

  return grouped;
}

function setSelectOptions(select, options) {
  select
    .selectAll("option")
    .data(options)
    .join("option")
    .attr("value", (d) => d.value)
    .text((d) => d.label);
}

function renderLocationChart(data) {
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const locChartRoot = d3.select("#locationChart");
  locChartRoot.selectAll("*").remove();

  const svg2 = locChartRoot.append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

  const defs = svg2.append("defs");
  
  const glowFilter = defs.append("filter")
    .attr("id", "glow")
    .attr("x", "-30%")
    .attr("y", "-30%")
    .attr("width", "160%")
    .attr("height", "160%");
  glowFilter.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
  const feMerge = glowFilter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "blur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");
  
  const g2 = svg2.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  svg2.append("text")
    .attr("x", margin.left)
    .attr("y", 10)
    .attr("font-size", 16)
    .attr("font-weight", 600)
    .attr("fill", "#e0e0e0")
    .text(`Top 15 Countries by Average Salary (Click to cross-filter Dashboard!)`);

  const aggLocMap = d3.rollup(
    data,
    v => {
      let jobCounts = {};
      v.forEach(x => { jobCounts[x.job_title] = (jobCounts[x.job_title] || 0) + 1; });
      let topJob = Object.keys(jobCounts).reduce((a,b) => jobCounts[a] > jobCounts[b] ? a : b, "Unknown");
      return {
        avg_salary: d3.mean(v, d => d.salary_in_usd),
        max_salary: d3.max(v, d => d.salary_in_usd),
        count: v.length,
        top_job: topJob
      };
    },
    d => d.company_location
  );
  
  let aggLoc = [];
  for (const [country, stats] of aggLocMap.entries()) {
    if (stats.count >= 3) { // filter out extreme noise
      aggLoc.push({ country: country, ...stats });
    }
  }
  aggLoc.sort((a,b) => b.avg_salary - a.avg_salary);
  aggLoc = aggLoc.slice(0, 15);

  const maxVal = d3.max(aggLoc, d => d.avg_salary) || 0;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([15, 75]);
  const colorScale = d3.scaleSequential(d3.interpolateCool).domain([0, maxVal]);

  const gradients = defs.selectAll("radialGradient")
    .data(aggLoc)
    .join("radialGradient")
    .attr("id", d => `grad-${d.country}`)
    .attr("cx", "30%").attr("cy", "30%").attr("r", "70%");

  gradients.append("stop").attr("offset", "0%").attr("stop-color", d => d3.color(colorScale(d.avg_salary)).brighter(1.2)).attr("stop-opacity", 1);
  gradients.append("stop").attr("offset", "100%").attr("stop-color", d => colorScale(d.avg_salary)).attr("stop-opacity", 1);

  if (window.locSimulation) window.locSimulation.stop();

  window.locSimulation = d3.forceSimulation(aggLoc)
    .force("collide", d3.forceCollide().radius(d => rScale(d.avg_salary) + 2).iterations(4).strength(1))
    .force("x", d3.forceX(innerWidth / 2).strength(0.015))
    .force("y", d3.forceY(innerHeight / 2).strength(0.015))
    .alphaDecay(0);

  const nodes = g2.selectAll(".bubble-group")
    .data(aggLoc)
    .join("g")
    .attr("class", "bubble-group")
    .style("cursor", "grab");
    
  nodes.call(d3.drag()
      .on("start", (event, d) => { d.fx = d.x; d.fy = d.y; d3.select(event.sourceEvent.target.parentNode).style("cursor", "grabbing"); })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => { d.fx = null; d.fy = null; d3.select(event.sourceEvent.target.parentNode).style("cursor", "grab"); })
  );

  nodes.on("mouseover", function(event, d) {
       d3.select(this).select("circle")
         .transition().duration(200)
         .attr("r", rScale(d.avg_salary) * 1.05);

       let cName = d.country;
       try { cName = regionNames.of(d.country) || d.country; } catch(e){}
       
       tooltip.html(
         `<strong>${getFlagEmoji(d.country)} ${cName}</strong><br>` +
         `Avg Salary: <span style="color:#10b981;font-weight:bold">${usdFormatter(d.avg_salary)}</span><br>` +
         `Max Salary: ${usdFormatter(d.max_salary)}<br>` +
         `Top Job: ${d.top_job}<br>` +
         `Records: ${d.count}<br>` +
         `<span style="color:#fbbf24;font-size:11px;font-style:italic;">(Click to filter Dashboard!)</span>`
       )
       .classed("show", true)
       .attr("aria-hidden", "false");
       moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function(event, d) {
       d3.select(this).select("circle").transition().duration(200).attr("r", rScale(d.avg_salary));
       hideTooltip();
    })
    .on("click", function(event, d) {
       // Toggle global filter
       if (globalLocationFilter === d.country) {
           globalLocationFilter = null;
       } else {
           globalLocationFilter = d.country;
       }
       
       // Visual feedback on selected bubbles
       g2.selectAll(".bubble-group").each(function(bd) {
           const isSelected = globalLocationFilter === bd.country;
           const isDimmed = globalLocationFilter !== null && !isSelected;
           
           d3.select(this).select("circle")
             .transition().duration(300)
             .attr("stroke", isSelected ? "#fcd34d" : "#ffffff")
             .attr("stroke-width", isSelected ? 4 : 1)
             .attr("opacity", isDimmed ? 0.2 : 1);
       });

       if(window.triggerGlobalUpdate) window.triggerGlobalUpdate();
    });

  nodes.append("circle")
    .attr("r", d => rScale(d.avg_salary))
    .attr("fill", d => `url(#grad-${d.country})`)
    .style("filter", "url(#glow)")
    .attr("stroke", "#ffffff")
    .attr("stroke-opacity", 0.8)
    .attr("stroke-width", 1);

  const texts = nodes.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#ffffff")
    .style("pointer-events", "none")
    .style("text-shadow", "0px 2px 4px rgba(0,0,0,0.8), 0px 0px 2px rgba(0,0,0,0.5)");

  texts.append("tspan")
    .attr("class", "country-text")
    .attr("x", 0)
    .attr("dy", "-0.8em")
    .style("font-size", "14px")
    .style("font-weight", "500")
    .text(d => getFlagEmoji(d.country));

  texts.append("tspan")
    .attr("class", "salary-text")
    .attr("x", 0)
    .attr("dy", "1.2em")
    .style("font-size", "14px")
    .style("font-weight", "800")
    .text(d => usdFormatter(d.avg_salary));

  window.locSimulation.on("tick", () => {
    for (let i = 0; i < aggLoc.length; i++) {
      let d = aggLoc[i];
      let r = rScale(d.avg_salary);
      d.vx += (Math.random() - 0.5) * 0.4;
      d.vy += (Math.random() - 0.5) * 0.4;
      if (d.x - r < 0) { d.x = r; d.vx *= -1; }
      if (d.x + r > innerWidth) { d.x = innerWidth - r; d.vx *= -1; }
      if (d.y - r < 0) { d.y = r; d.vy *= -1; }
      if (d.y + r > innerHeight) { d.y = innerHeight - r; d.vy *= -1; }
    }
    nodes.attr("transform", d => `translate(${d.x}, ${d.y})`);
  });
}
function showTooltip(event, d) {
  // figure out the rank for the tooltip from what's currently on screen
  const displayedBars = g.selectAll("rect.bar").data();
  let rankIndex = -1;
  for (let i = 0; i < displayedBars.length; i++) {
    if (displayedBars[i].job_title === d.job_title) {
      rankIndex = i;
      break;
    }
  }
  
  let rankText = "Rank: N/A";
  if (rankIndex >= 0) {
    rankText = `Rank: #${rankIndex + 1} out of ${displayedBars.length}`;
  }

  tooltip
    .html(
      `<strong>${d.job_title}</strong><br>` +
        `Average: ${usdFormatter(d.avgSalary)}<br>` +
        `Records: ${d.count}<br>` +
        // append rank info
        `${rankText}`
    )
    .classed("show", true)
    .attr("aria-hidden", "false");

  moveTooltip(event);
}

function moveTooltip(event) {
  const offsetX = 14;
  const offsetY = 14;

  tooltip
    .style("left", `${event.clientX + offsetX}px`)
    .style("top", `${event.clientY + offsetY}px`);
}

function hideTooltip() {
  tooltip.classed("show", false).attr("aria-hidden", "true");
}

function stopMoneyRain(removeExisting = false) {
  if (activeMoneyRain.timerId !== null) {
    clearInterval(activeMoneyRain.timerId);
    activeMoneyRain.timerId = null;
    activeMoneyRain.jobTitle = null;
  }

  if (removeExisting) {
    moneyRainLayer.selectAll("rect.money-note").interrupt().remove();
    pileLayer.selectAll("*").remove();
  }
}

function spawnMoneyNoteForBar(datum) {
  const barX = xScale(datum.job_title);
  const bandWidth = xScale.bandwidth();
  if (barX === undefined || !Number.isFinite(bandWidth)) return;

  const barTopY = yScale(datum.avgSalary);

  const noteWidth = 10 + Math.random() * 8;
  const noteHeight = 5 + Math.random() * 4;
  const xJitter = Math.random() * Math.max(bandWidth - noteWidth, 1);
  const startX = barX + xJitter;

  const startY = 0;
  let currentDropY = innerHeight - activeMoneyRain.accumulatedHeight - noteHeight;
  if (currentDropY < activeMoneyRain.barTopY) {
    currentDropY = activeMoneyRain.barTopY;
  }

  const note = moneyRainLayer
    .append("rect")
    .attr("class", "money-note")
    .attr("x", startX)
    .attr("y", startY)
    .attr("width", noteWidth)
    .attr("height", noteHeight)
    .attr("rx", 1.2)
    .attr("fill", "#10b981")
    .attr("stroke", "#059669")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.95);

  const duration = 1500 + Math.random() * 1000;

  note
    .transition()
    .duration(duration)
    .ease(d3.easeLinear)
    .attr("y", currentDropY)
    .on("end", function() {
      d3.select(this).remove();
      if (activeMoneyRain.accumulatedHeight < activeMoneyRain.maxStackHeight) {
        const growth = noteHeight * 0.15;
        activeMoneyRain.accumulatedHeight += growth;
        if (activeMoneyRain.accumulatedHeight > activeMoneyRain.maxStackHeight) {
          activeMoneyRain.accumulatedHeight = activeMoneyRain.maxStackHeight;
        }
        d3.select("#money-pile")
          .attr("y", innerHeight - activeMoneyRain.accumulatedHeight)
          .attr("height", activeMoneyRain.accumulatedHeight);
      }
    });
}

function startMoneyRain(datum) {
  // keep one rain loop active
  stopMoneyRain(true);
  activeMoneyRain.jobTitle = datum.job_title;
  activeMoneyRain.barTopY = yScale(datum.avgSalary);
  activeMoneyRain.maxStackHeight = innerHeight - activeMoneyRain.barTopY;
  activeMoneyRain.accumulatedHeight = 0;

  const barX = xScale(datum.job_title);
  const bandWidth = xScale.bandwidth();

  pileLayer.selectAll("*").remove();
  pileLayer.append("rect")
    .attr("id", "money-pile")
    .attr("x", barX)
    .attr("y", innerHeight)
    .attr("width", bandWidth)
    .attr("height", 0)
    .attr("fill", "#10b981")
    .attr("opacity", 0.85)
    .attr("rx", 2);

  const currentMaxSalary = yScale.domain()[1] || 1;
  const normalized = Math.max(0, Math.min(1, datum.avgSalary / currentMaxSalary));

  const notesPerTick = 1 + Math.round(normalized * 3);

  const intervalMs = Math.max(200, 500 - Math.round(normalized * 250));

  activeMoneyRain.timerId = setInterval(() => {
    for (let i = 0; i < notesPerTick; i += 1) {
      spawnMoneyNoteForBar(datum);
    }
  }, intervalMs);
}

function renderChart(data, selectedYear, selectedExp) {
  // reset old rain when chart updates
  stopMoneyRain(true);

  const topN = 12;
  let chartData = data.slice();
  
  // Sort from highest to lowest salary
  chartData.sort(function(a, b) {
    return b.avgSalary - a.avgSalary;
  });
  
  // Take top N
  chartData = chartData.slice(0, topN);

  const maxVal = d3.max(chartData, (d) => d.avgSalary) || 1;

  xScale.domain(chartData.map((d) => d.job_title));
  yScale.domain([0, maxVal]).nice();

  const colorScale = d3.scaleSequential(t => d3.interpolateBlues(0.3 + 0.7 * t))
    .domain([0, maxVal]);

  const t = svg.transition().duration(700).ease(d3.easeCubicOut);

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale).ticks(8).tickFormat((d) => usdFormatter(d));

  xAxisG
    .transition(t)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-28)")
    .style("text-anchor", "end")
    .attr("dx", "-0.55em")
    .attr("dy", "0.35em");

  yAxisG.transition(t).call(yAxis);

  gridG
    .transition(t)
    .call(d3.axisLeft(yScale).ticks(8).tickSize(-innerWidth).tickFormat(""));

  const bars = g
    .selectAll("rect.bar")
    .data(chartData, (d) => d.job_title)
    .join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "bar")
          .attr("x", (d) => xScale(d.job_title))
          .attr("y", yScale(0))
          .attr("width", xScale.bandwidth())
          .attr("height", 0),
      (update) => update,
      (exit) =>
        exit
          .transition(t)
          .attr("y", yScale(0))
          .attr("height", 0)
          .remove()
    );

  bars
    .on("mouseover", function (event, d) {
      // Interrupt any running transition so hover applies instantly
      d3.select(this).interrupt();
      
      d3.select(this)
        .style("fill", "transparent") // completely transparent via style
        .attr("fill", "none") // and attr, just to be safe
        .attr("stroke", colorScale(d.avgSalary))
        .attr("stroke-width", "2px");

      showTooltip(event, d);
      startMoneyRain(d);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function (event, d) {
      d3.select(this).interrupt();
      
      d3.select(this)
        .style("fill", null) // remove style override
        .attr("fill", colorScale(d.avgSalary)) // restore attr
        .attr("stroke", "none")
        .attr("stroke-width", "0px");

      hideTooltip();
      // stop and clear rain
      stopMoneyRain(true);
    })
    .transition(t)
    .attr("x", (d) => xScale(d.job_title))
    .attr("width", xScale.bandwidth())
    .attr("y", (d) => yScale(d.avgSalary))
    .attr("height", (d) => innerHeight - yScale(d.avgSalary))
    .attr("fill", (d) => colorScale(d.avgSalary));

  const expLabel = experienceLabelMap[selectedExp] || selectedExp;
  titleText.text(`Average Salary by Job Title — Year: ${selectedYear}, Experience: ${expLabel}`);
}

function flattenAggregateForSelection(aggregateMap, year, exp) {
  const yearMap = aggregateMap.get(year);
  if (!yearMap) {
    return [];
  }

  const expMap = yearMap.get(exp);
  if (!expMap) {
    return [];
  }

  const result = [];
  for (const [job_title, stats] of expMap.entries()) {
    result.push({
      job_title: job_title,
      avgSalary: stats.avgSalary,
      count: stats.count,
    });
  }

  return result;
}

function initialize(rawRows) {
  const rows = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const parsedSalary = Number(row.salary_in_usd);
    
    if (row.work_year && row.experience_level && row.job_title && Number.isFinite(parsedSalary)) {
      rows.push({
        ...row,
        salary_in_usd: parsedSalary,
        work_year: row.work_year,
        experience_level: row.experience_level,
        job_title: row.job_title,
        company_location: row.company_location
      });
    }
  }

  const allYearsSet = new Set();
  const allExpLevelsSet = new Set();
  const allLocationsSet = new Set();
  
  for (let i = 0; i < rows.length; i++) {
    allYearsSet.add(rows[i].work_year);
    allExpLevelsSet.add(rows[i].experience_level);
    allLocationsSet.add(rows[i].company_location);
  }

  const allYears = Array.from(allYearsSet).sort(d3.ascending);
  const allExpLevels = Array.from(allExpLevelsSet).sort(d3.ascending);
  const allLocations = Array.from(allLocationsSet).sort(d3.ascending);

  setSelectOptions(
    yearFilter,
    allYears.map((y) => ({ value: y, label: y }))
  );

  setSelectOptions(
    experienceFilter,
    allExpLevels.map((e) => ({
      value: e,
      label: experienceLabelMap[e] || e,
    }))
  );

  yearFilter.property("value", allYears[allYears.length - 1]);
  experienceFilter.property("value", "SE");

  function update() {
    const selectedYear = yearFilter.property("value");
    const selectedExp = experienceFilter.property("value");
    
    // Apply Global Cross-Filter (from Location Bubble Chart)
    const locationFilteredRows = globalLocationFilter 
        ? rows.filter(d => d.company_location === globalLocationFilter)
        : rows;

    // Dynamically rebuild aggregates so the Bar chart reflects the location!
    const dynamicAggregates = buildAggregates(locationFilteredRows);
    const chartData = flattenAggregateForSelection(dynamicAggregates, selectedYear, selectedExp);
    
    renderChart(chartData, selectedYear, selectedExp);
    
    // Pass filtered data down to Beeswarm
    if (typeof renderBeeswarmChart === "function") {
        // preserve the current split mode from buttons if possible
        let activeMode = 'all';
        const activeBtn = d3.select(".b-btn.active");
        if (!activeBtn.empty()) activeMode = activeBtn.attr("data-group");
        
        renderBeeswarmChart(locationFilteredRows);
        
        // Retrigger forces to maintain current visual state
        if (window._beeswarmUpdateForces) {
            window._beeswarmUpdateForces(activeMode);
        }
    }
  }

  // Expose it globally so Bubble Chart click can trigger it
  window.triggerGlobalUpdate = update;


  function updateLocationChart() {
    renderLocationChart(rows);
    renderBeeswarmChart(rows);
  }

  yearFilter.on("change", update);
  experienceFilter.on("change", update);

  update();
  updateLocationChart();
}

d3.csv("data/salaries.csv")
  .then(initialize)
  .catch((error) => {
    console.error("Failed to load CSV:", error);
    chartRoot
      .append("p")
      .style("color", "#b91c1c")
      .style("font-weight", "600")
      .text("Could not load data/salaries.csv. Make sure you open this with a local server.");
  });

function renderBeeswarmChart(dataRaw) {
  const root = d3.select("#beeswarmChart");
  root.selectAll("*").remove();

  const width = 1000;
  const height = 560;
  const margin = { top: 40, right: 60, bottom: 60, left: 140 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = root.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  // Chart Title
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 25)
    .attr("font-size", "16px")
    .attr("font-weight", 600)
    .attr("fill", "#e0e0e0")
    .text("Salary Distribution force-directed Swarm Plot (Each dot = 1 Data Point)");

  // Random sample if dataset is huge, to keep animations smooth
  let data = dataRaw;
  if (data.length > 700) {
    data = d3.shuffle(data.slice()).slice(0, 700);
  }

  // Scales
  const maxSal = d3.max(data, d => d.salary_in_usd);
  const xScale = d3.scaleLinear()
    .domain([0, Math.min(maxSal, 350000)]) // cut off long tails slightly for better spread
    .range([margin.left, width - margin.right])
    .clamp(true);

  // Group Definitions for Splitting
  const centerY = height / 2;
  const groupsY = {
    all: centerY,
    experience: {
      'EN': height * 0.25,
      'MI': height * 0.45,
      'SE': height * 0.65,
      'EX': height * 0.85
    },
    size: {
      'S': height * 0.3,
      'M': height * 0.55,
      'L': height * 0.8
    }
  };

  const expMap = { 'EN': 'Entry', 'MI': 'Mid', 'SE': 'Senior', 'EX': 'Executive' };
  const sizeMap = { 'S': 'Small', 'M': 'Medium', 'L': 'Large' };

  // Setup X-Axis
  svg.append("g")
      .attr("transform", `translate(0, ${height - margin.bottom / 2})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d3.format("$,.0f")))
      .attr("color", "#a0a0a0")
      .selectAll("text")
      .attr("font-size", "12px");

  // X Axis Label
  svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#a0a0a0")
      .attr("font-size", 12)
      .text("Salary in USD");

  // The layer for the split labels
  const labelLayer = svg.append("g").attr("class", "y-labels");

  // Draw the actual nodes
  const radius = 4.5;
  const colorScale = d3.scaleOrdinal()
    .domain(['EN', 'MI', 'SE', 'EX'])
    .range(["#60a5fa", "#34d399", "#fbbf24", "#f87171"]);

  const nodes = svg.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("r", radius)
    .attr("fill", d => colorScale(d.experience_level || "MI"))
    .attr("stroke", "#121212")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.9)
    .on("mouseover", function(event, d) {
       d3.select(this)
         .attr("stroke", "#ffffff")
         .attr("stroke-width", 2)
         .attr("opacity", 1);
         
       tooltip.html(
         `<strong>${d.job_title}</strong><br>` +
         `Salary: <span style="color:#10b981;font-weight:bold">${d3.format("$,.0f")(d.salary_in_usd)}</span><br>` +
         `Exp: ${expMap[d.experience_level] || d.experience_level}<br>` +
         `Size: ${sizeMap[d.company_size] || d.company_size}<br>` +
         `Location: ${d.company_location}`
       )
       .classed("show", true)
       .attr("aria-hidden", "false");
       moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function(event, d) {
       d3.select(this)
         .attr("stroke", "#121212")
         .attr("stroke-width", 0.5)
         .attr("opacity", 0.9);
       hideTooltip();
    });

  // Keep a reference to the simulation so we can stop/update it
  if (window._beeswarmSim) {
      window._beeswarmSim.stop();
  }

  const simulation = d3.forceSimulation(data)
    .force("x", d3.forceX(d => xScale(d.salary_in_usd)).strength(1))
    .force("y", d3.forceY(centerY).strength(0.12))
    .force("collide", d3.forceCollide(radius + 0.5).iterations(2))
    .alphaDecay(0.035) // let it settle beautifully
    .on("tick", () => {
       nodes.attr("cx", d => d.x).attr("cy", d => d.y);
    });

  window._beeswarmSim = simulation;

  // The Interaction function to split the beeswarm
  function updateForces(mode) {
      window._beeswarmUpdateForces = updateForces;
      labelLayer.selectAll("*").remove();

      if (mode === 'all') {
          simulation.force("y", d3.forceY(centerY).strength(0.12));
      } else if (mode === 'experience') {
          const labelsData = [
              {y: groupsY.experience['EN'], text: 'Entry Level'},
              {y: groupsY.experience['MI'], text: 'Mid Level'},
              {y: groupsY.experience['SE'], text: 'Senior'},
              {y: groupsY.experience['EX'], text: 'Executive'}
          ];
          drawYLabels(labelsData);
          simulation.force("y", d3.forceY(d => groupsY.experience[d.experience_level] || centerY).strength(0.15));
      } else if (mode === 'size') {
          const labelsData = [
              {y: groupsY.size['S'], text: 'Small Co.'},
              {y: groupsY.size['M'], text: 'Medium Co.'},
              {y: groupsY.size['L'], text: 'Large Co.'}
          ];
          drawYLabels(labelsData);
          simulation.force("y", d3.forceY(d => groupsY.size[d.company_size] || centerY).strength(0.15));
      }

      // Heat up the simulation to trigger the animation burst!
      simulation.alpha(0.8).restart();
  }

  function drawYLabels(labelData) {
      // Add subtle background grid line for each group
      labelLayer.selectAll(".grid-line")
         .data(labelData)
         .join("line")
         .attr("class", "grid-line")
         .attr("x1", margin.left - 20)
         .attr("x2", width - margin.right + 20)
         .attr("y1", d => d.y)
         .attr("y2", d => d.y)
         .attr("stroke", "#334155")
         .attr("stroke-dasharray", "4,4");

      labelLayer.selectAll(".cat-label")
         .data(labelData)
         .join("text")
         .attr("class", "cat-label")
         .attr("x", margin.left - 15)
         .attr("y", d => d.y)
         .attr("dy", "0.35em")
         .attr("text-anchor", "end")
         .attr("fill", "#e0e0e0")
         .attr("font-size", "14px")
         .attr("font-weight", 600)
         .text(d => d.text);
  }

  // Hook up external buttons
  d3.selectAll(".b-btn").on("click", function() {
      const btn = d3.select(this);
      d3.selectAll(".b-btn").classed("active", false);
      btn.classed("active", true);
      const mode = btn.attr("data-group");
      updateForces(mode);
  });
}