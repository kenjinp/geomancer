#include <shadowmap_pars_vertex>

// Start with standard vertex projection
#ifdef USE_INSTANCING
vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );
#else
vec4 mvPosition = vec4( transformed, 1.0 );
#endif

// Calculate sphere-projected position using the existing sphereDir from beginnormal_vertex
// The variable is already defined in beginnormal_vertex.glsl as:
// vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
// vec3 sphereDir = normalize(worldPos.xyz - uOffset);
vec3 spherePos = uOffset + sphereDir * uRadius;

// Store data for fragment shader
vWorldPosition = vec4(spherePos, 1.0);
vSphereNormal = normalize(mat3(modelViewMatrix) * sphereDir);

// Calculate model-view-projected position
vec4 spherePosView = viewMatrix * vec4(spherePos, 1.0);
mvPosition = spherePosView;

// Standard Three.js position calculation
gl_Position = projectionMatrix * mvPosition;

// Handle shadows
#ifdef USE_SHADOWMAP
    vec4 worldPosition = vec4(spherePos, 1.0);
    #if defined( USE_SHADOWMAP ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
    
    #if NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SPOT_LIGHT_COORDS > 0 || NUM_POINT_LIGHT_SHADOWS > 0
        // Adjusting position vectors for shadow map
        vec3 shadowWorldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * sphereDir );
        shadowWorldNormal = normalize( shadowWorldNormal );
        
        // Offset position along normal slightly to prevent self-shadowing issues
        vec4 shadowWorldPosition = vec4( spherePos + shadowWorldNormal * 0.005, 1.0 );
        
        #if NUM_DIR_LIGHT_SHADOWS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
            vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
        }
        #pragma unroll_loop_end
        #endif

        #if NUM_POINT_LIGHT_SHADOWS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
            vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
        }
        #pragma unroll_loop_end
        #endif
        
        #if NUM_SPOT_LIGHT_SHADOWS > 0 || NUM_SPOT_LIGHT_COORDS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
            vSpotShadowCoord[ i ] = spotShadowMatrix[ i ] * shadowWorldPosition;
        }
        #pragma unroll_loop_end
        #endif
        
    #endif
    
    #endif
#endif 