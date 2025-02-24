const int NOAA_RAMP_SIZE = 18;

vec4 noaaRampColors[NOAA_RAMP_SIZE] = vec4[](
    vec4(1.0, 1.0, 1.0, 1.0),      // #ffffff
    vec4(0.878, 0.843, 0.816, 1.0), // #E0D7D0
    vec4(0.804, 0.725, 0.612, 1.0), // #CDB99C
    vec4(0.729, 0.580, 0.408, 1.0), // #BA9468
    vec4(0.608, 0.494, 0.263, 1.0), // #9B7E43
    vec4(0.459, 0.459, 0.176, 1.0), // #75752D
    vec4(0.271, 0.424, 0.094, 1.0), // #456C18
    vec4(0.090, 0.333, 0.082, 1.0), // #175515
    vec4(0.000, 0.251, 0.137, 1.0), // #004023
    vec4(0.878, 0.988, 0.894, 1.0), // #E0FCE4
    vec4(0.671, 0.886, 0.843, 1.0), // #ABE2D7
    vec4(0.475, 0.776, 0.804, 1.0), // #79C6CD
    vec4(0.361, 0.675, 0.792, 1.0), // #5CACCA
    vec4(0.247, 0.569, 0.780, 1.0), // #3F91C7
    vec4(0.176, 0.459, 0.690, 1.0), // #2D75B0
    vec4(0.133, 0.333, 0.502, 1.0), // #225580
    vec4(0.114, 0.251, 0.322, 1.0), // #1D4052
    vec4(0.102, 0.204, 0.204, 1.0)  // #1A3434
);

float noaaRampElevations[NOAA_RAMP_SIZE] = float[](
    8000.0,
    4000.0, 
    2000.0,
    1000.0,
    500.0,
    250.0,
    50.0,
    10.0,
    0.1,
    0.0,
    -2.0,
    -10.0,
    -50.0,
    -250.0,
    -1000.0,
    -2000.0,
    -4000.0,
    -8000.0
);

vec4 getColorForElevation(float elevation) {
    // Handle edge cases
    if (elevation >= noaaRampElevations[0]) {
        return noaaRampColors[0];
    }
    if (elevation <= noaaRampElevations[NOAA_RAMP_SIZE-1]) {
        return noaaRampColors[NOAA_RAMP_SIZE-1];
    }

    // Find the elevation bracket
    for (int i = 0; i < NOAA_RAMP_SIZE-1; i++) {
        if (elevation <= noaaRampElevations[i] && elevation > noaaRampElevations[i+1]) {
            // Linear interpolation between colors
            float t = (elevation - noaaRampElevations[i+1]) / 
                     (noaaRampElevations[i] - noaaRampElevations[i+1]);
            return mix(noaaRampColors[i+1], noaaRampColors[i], t);
        }
    }

    // Fallback (should never reach here if elevation is in range)
    return noaaRampColors[0];
}
