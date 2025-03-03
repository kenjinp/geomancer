// Map layer utilities

bool getMapLayer(uint layer) {
    return bool((uMapLayers >> layer) & 1u);
} 