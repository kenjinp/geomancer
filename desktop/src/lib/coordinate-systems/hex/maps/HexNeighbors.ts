// Add validation when generating neighbor map
neighbors.forEach((neighbor, i) => {
  if (!HexGrid.indexMap.has(neighbor)) {
    console.warn("Invalid neighbor:", neighbor, "for cell", h3Index);
  }
});
