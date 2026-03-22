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
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const locChartRoot = d3.select("#locationChart");
  locChartRoot.selectAll("*").remove();

  const svg2 = locChartRoot.append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  
  const g2 = svg2.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  svg2.append("text")
    .attr("x", margin.left)
    .attr("y", -10)
    .attr("font-size", 16)
    .attr("font-weight", 600)
    .attr("fill", "#e0e0e0")
    .text(`Top 5 Countries by Average Salary`);

  const aggLocMap = d3.rollup(
    data,
    v => d3.mean(v, d => d.salary_in_usd),
    d => d.company_location
  );
  
  let aggLoc = [];
  for (const [country, avg_salary] of aggLocMap.entries()) {
    aggLoc.push({ country: country, avg_salary: avg_salary });
  }
  
  aggLoc.sort(function(a, b) {
    return b.avg_salary - a.avg_salary;
  });
  
  aggLoc = aggLoc.slice(0, 5);

  const maxVal = d3.max(aggLoc, d => d.avg_salary) || 0;

  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([20, 110]);
  const colorScale = d3.scaleSequential(d3.interpolateCool).domain([0, maxVal]);

  if (window.locSimulation) {
    window.locSimulation.stop();
  }

  window.locSimulation = d3.forceSimulation(aggLoc)
    .force("collide", d3.forceCollide().radius(d => rScale(d.avg_salary) + 2).iterations(4).strength(1))
    .force("x", d3.forceX(innerWidth / 2).strength(0.01))
    .force("y", d3.forceY(innerHeight / 2).strength(0.01))
    .alphaDecay(0);

  const nodes = g2.selectAll("g")
    .data(aggLoc)
    .join("g")
    .style("cursor", "grab")
    .call(d3.drag()
      .on("start", (event, d) => { d.fx = d.x; d.fy = d.y; })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => { d.fx = null; d.fy = null; })
    );

  nodes.append("circle")
    .attr("r", d => rScale(d.avg_salary))
    .attr("fill", d => colorScale(d.avg_salary));

  const texts = nodes.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#ffffff")
    .style("pointer-events", "none");

  texts.append("tspan")
    .attr("x", 0)
    .attr("dy", "-0.4em")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text(d => {
      try {
        return regionNames.of(d.country) || d.country;
      } catch (e) {
        return d.country;
      }
    });

  texts.append("tspan")
    .attr("x", 0)
    .attr("dy", "1.2em")
    .style("font-size", "12px")
    .text(d => d3.format("$,.0f")(d.avg_salary));

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

  const aggregates = buildAggregates(rows);

  function update() {
    const selectedYear = yearFilter.property("value");
    const selectedExp = experienceFilter.property("value");

    const chartData = flattenAggregateForSelection(aggregates, selectedYear, selectedExp);
    renderChart(chartData, selectedYear, selectedExp);
  }

  function updateLocationChart() {
    renderLocationChart(rows);
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
