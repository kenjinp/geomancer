// Latitude/Longitude utility functions

struct LatLong {
    float lat;
    float lon;
};

LatLong getLatLong(vec3 position, float radius) {
    // should probably use z,x for longitude, but we messed that up in the latlong class of hello worlds
    float longitude = atan(position.x, position.z) * RAD2DEG;
    float latitude = atan(-position.y, length(position.xz)) * RAD2DEG;
    return LatLong(latitude, longitude);
}

vec2 getLatLongUV(LatLong latLong) {
    return vec2(
        remap(latLong.lon, -180., 180., 0., 1.),
        remap(latLong.lat, -90., 90., 0., 1.)
    );
} 