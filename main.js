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
  .text("Average Salary by Job Title");

const xLabel = svg
  .append("text")
  .attr("x", margin.left + innerWidth / 2)
  .attr("y", chartHeight - 16)
  .attr("text-anchor", "middle")
  .attr("fill", "#374151")
  .attr("font-size", 12)
  .text("Job Title (Top 12 by average salary)");

const yLabel = svg
  .append("text")
  .attr("x", -(margin.top + innerHeight / 2))
  .attr("y", 20)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .attr("fill", "#374151")
  .attr("font-size", 12)
  .text("Average Salary (USD)");

const xScale = d3.scaleBand().range([0, innerWidth]).padding(0.18);
const yScale = d3.scaleLinear().range([innerHeight, 0]);

const usdFormatter = d3.format("$,.0f");

// This dictionary keeps raw CSV codes (EN/MI/SE/EX) separate from display text.
// Why: preserving raw codes makes filtering reliable, while user-facing labels stay clear.
const experienceLabelMap = {
  EN: "Entry-level",
  MI: "Mid-level",
  SE: "Senior-level",
  EX: "Executive-level",
};

// We pre-aggregate data by (year + experience + title) once.
// This avoids recalculating from all 13k rows every filter change and keeps interactions smooth.
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

function showTooltip(event, d) {
  tooltip
    .html(
      `<strong>${d.job_title}</strong><br>` +
        `Average: ${usdFormatter(d.avgSalary)}<br>` +
        `Records: ${d.count}`
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

function renderChart(data, selectedYear, selectedExp) {
  // Keep the chart bounded to top N categories to avoid overcrowded labels and many SVG bars.
  // This is our performance + readability strategy for a large dataset.
  const topN = 12;
  const chartData = data
    .slice()
    .sort((a, b) => d3.descending(a.avgSalary, b.avgSalary))
    .slice(0, topN);

  xScale.domain(chartData.map((d) => d.job_title));
  yScale.domain([0, d3.max(chartData, (d) => d.avgSalary) || 1]).nice();

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
    .on("mouseenter", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .transition(t)
    .attr("x", (d) => xScale(d.job_title))
    .attr("width", xScale.bandwidth())
    .attr("y", (d) => yScale(d.avgSalary))
    .attr("height", (d) => innerHeight - yScale(d.avgSalary));

  // We translate internal experience codes to readable labels for the title.
  // This makes the chart self-explanatory for users unfamiliar with dataset abbreviations.
  const expLabel = experienceLabelMap[selectedExp] || selectedExp;
  titleText.text(`Average Salary by Job Title — Year: ${selectedYear}, Experience: ${expLabel}`);
}

function flattenAggregateForSelection(aggregateMap, year, exp) {
  const yearMap = aggregateMap.get(year);
  if (!yearMap) return [];

  const expMap = yearMap.get(exp);
  if (!expMap) return [];

  return Array.from(expMap, ([job_title, stats]) => ({
    job_title,
    avgSalary: stats.avgSalary,
    count: stats.count,
  }));
}

function initialize(rawRows) {
  const rows = rawRows
    .map((d) => ({
      work_year: d.work_year,
      experience_level: d.experience_level,
      job_title: d.job_title,
      salary_in_usd: +d.salary_in_usd,
    }))
    .filter((d) => d.work_year && d.experience_level && d.job_title && Number.isFinite(d.salary_in_usd));

  const allYears = Array.from(new Set(rows.map((d) => d.work_year))).sort(d3.ascending);
  const allExpLevels = Array.from(new Set(rows.map((d) => d.experience_level))).sort(d3.ascending);

  setSelectOptions(
    yearFilter,
    allYears.map((y) => ({ value: y, label: y }))
  );

  setSelectOptions(
    experienceFilter,
    // Keep option value as the raw code (for filtering), but render a human-readable label.
    allExpLevels.map((e) => ({
      value: e,
      label: experienceLabelMap[e] || e,
    }))
  );

  // Pick defaults that are likely meaningful for this salary dataset.
  yearFilter.property("value", allYears[allYears.length - 1]);
  experienceFilter.property("value", "SE");

  const aggregates = buildAggregates(rows);

  function update() {
    const selectedYear = yearFilter.property("value");
    const selectedExp = experienceFilter.property("value");

    const chartData = flattenAggregateForSelection(aggregates, selectedYear, selectedExp);
    renderChart(chartData, selectedYear, selectedExp);
  }

  yearFilter.on("change", update);
  experienceFilter.on("change", update);

  update();
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
