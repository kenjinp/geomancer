# Planetary Creation Algo

from https://frozenfractal.com/blog/2023/11/2/around-the-world-1-continents/
and https://web.archive.org/web/20180307135703/https://experilous.com/1/blog/post/procedural-planet-generation

ocean coverage percentage ~ 71
break world into voronoi tiles based on some _value_
floodfill voronoi until ocean coverage percentage achieved
assign hex tiles to voronoi plates with domain warping

## TODO

### Gameplan

- Find distance to coast (mergine all touching continents)
- Find distance from shore in ocean (opposite direction)
- calculate movement over hex vertex
- classify boundaries
- apply elevation functions
- apply hotspots

### Bugs

- Merge polygons does not seem to work, polygons aren't merging well
- Need to find a way to locate true voronoi region if it lies outside polygon because the spatial hash doesnt know
- fix pole problem
  - possible fix is to manually assign
- Ocean / left-over plates
  - if there are left-over regions we can try assign them to contiguous polygons and then to their own plates
