# BragBot UI Style Guide

## Color Palette
- Dark theme only (Mantine `forceColorScheme="dark"`)
- Chart colors: `#339af0`, `#51cf66`, `#fcc419`, `#ff6b6b`, `#cc5de8`, `#20c997`, `#ff922b`
- Chart grid/axis: `stroke="#444"` for grid, `stroke="#aaa"` for axes
- Tooltip backgrounds: `backgroundColor: "#1a1b1e"`, `border: "1px solid #444"`

## Button Hover Styles
Three hover patterns depending on button type:

### Filled buttons (e.g. Refresh)
Class: `hover-outline`
- Default: solid blue background, white text
- Hover: transparent background, blue outline

### Subtle/gray buttons (e.g. Force, date range)
Class: `hover-gray-outline-blue-text`
- Default: no background, gray text
- Hover: gray outline, blue text

### Org dropdown
Class: `org-select`
- Default: dimmed text, no decoration
- Hover: blue text

## Interactive Elements
- All interactive header elements must have a Mantine `Tooltip` (`MTooltip` alias, since `Tooltip` is used by Recharts) with `position="bottom"` and `withArrow`
- Dropdowns: use `variant="unstyled"` with `rightSection={<></>}` to hide the chevron, match surrounding text style
- Cursor: `pointer` for clickable elements, `crosshair` for zoomable charts

## Charts (Recharts)
- Tooltip text must be readable: use custom `PieTooltip` for all pie charts (colored text matching slice), custom `content` renderer for scatter plots
- Pie chart tooltip pattern (use in every file with pie charts):
  ```tsx
  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const { name, value } = payload[0];
    return (
      <div style={{ backgroundColor: "#1a1b1e", border: "1px solid #444", padding: "6px 10px", borderRadius: 4 }}>
        <span style={{ color: payload[0].payload.fill }}>{name}: {value}</span>
      </div>
    );
  };
  ```
- Pie charts: `labelLine={false}`, inline label with threshold: `label={({ name, value, percent }) => percent > 0.05 ? \`${name}: ${value}\` : ""}`
- Scatter plots: `isAnimationActive={false}` for instant transitions
- Zoomable charts must be extracted into their own component to avoid re-rendering the entire dashboard on drag
- Zoomable chart containers: `userSelect: "none"`, `WebkitUserSelect: "none"`, wrap in `<div onMouseDown={(e) => e.preventDefault()}>` to prevent text selection
- Use `allowDataOverflow` on axes when zoom is active

## Component Structure
- Extract stateful chart components (e.g. zoom state) into separate files to isolate re-renders
- Use `Section` wrapper for chart sections with titles
- Use `StatCard` for metric display
- Use `Paper p="md" radius="md" withBorder` for chart containers

## Text
- Dimmed/secondary text: `c="dimmed"`
- Labels and hints: `size="xs"`
- No custom fonts — use Mantine defaults
