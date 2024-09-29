import { noaaRamp } from "../../lib/geo/colors";

const convertToHumanReadable = (meters: number): string => {
  const units = [
    { unit: "km", factor: 1000 },
    { unit: "m", factor: 1 },
    { unit: "cm", factor: 0.01 },
    { unit: "mm", factor: 0.001 },
  ];

  const absMeters = Math.abs(meters);
  const sign = meters < 0 ? "-" : "";

  for (const { unit, factor } of units) {
    if (absMeters >= factor || (absMeters > 0 && factor === 0.001)) {
      const value = absMeters / factor;
      const roundedValue = Math.round(value * 100) / 100; // Round to 2 decimal places
      return `${sign}${roundedValue}${unit}`;
    }
  }

  return "0m"; // Return 0m for values very close to zero
};

export const ColorRamp = () => {
  return (
    <div className="flex flex-col bg-primary h-[calc(100%-32px)]">
      {noaaRamp.map((color, index) => {
        return (
          <div
            key={index}
            className="relative text-xs w-2 h-full"
            style={{ backgroundColor: color.color }}
          >
            <div className="h-full flex items-center">
              <span className="absolute right-4 text-xs text-white">
                {convertToHumanReadable(color.elevation)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
