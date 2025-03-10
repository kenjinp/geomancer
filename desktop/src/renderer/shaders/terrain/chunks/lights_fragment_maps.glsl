// Debug visualization - uncomment to see which branch is active
// if (!getMapLayer(2u)) {
//     gl_FragColor.r += 0.3; // Red tint for no shadows
// } else {
//     gl_FragColor.g += 0.3; // Green tint for shadows enabled
// }

#if defined( RE_Direct )

	#ifdef USE_SHADOWMAP
    // ===== SHADOW OVERRIDE IMPLEMENTATION =====
    // This completely replaces Three.js's shadow calculation with our own version
    // that respects the MapLayer.REALISTIC_LIGHTING flag (layer index 2)

    // Store the shadow mode for use throughout this shader chunk
    bool useShadows = getMapLayer(2u); // MapLayer.REALISTIC_LIGHTING

    // Replace the Three.js getShadow function with our own version that
    // completely bypasses shadow calculation when shadows are disabled
    #if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
    
    // Redefine any shadow functions to respect our flag

    // This override will force all shadows to a brightness of 1.0 (no shadow) 
    // when shadows are disabled via the map layer
    float terrainGetShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord) {
        // If shadows are disabled, always return 1.0 (full brightness, no shadow)
        if (!useShadows) {
            return 1.0;
        }
        
        // Otherwise use the standard shadow calculation
        float shadow = 1.0;
        shadowCoord.xyz /= shadowCoord.w;
        shadowCoord.z += shadowBias;
        
        // Check if the fragment is within the shadow map's frustum
        bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
        bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
        
        if (frustumTest) {
            #if defined( SHADOWMAP_TYPE_PCF )
                vec2 texelSize = vec2(1.0) / shadowMapSize;
                float dx0 = -texelSize.x * shadowRadius;
                float dy0 = -texelSize.y * shadowRadius;
                float dx1 = texelSize.x * shadowRadius;
                float dy1 = texelSize.y * shadowRadius;
                
                shadow = (
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy0), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy0), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy0), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, 0.0), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, 0.0), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy1), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0, dy1), shadowCoord.z) +
                    texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy1), shadowCoord.z)
                ) * (1.0 / 9.0);
            #elif defined( SHADOWMAP_TYPE_PCF_SOFT )
                vec2 texelSize = vec2(1.0) / shadowMapSize;
                float dx = texelSize.x;
                float dy = texelSize.y;
                vec2 uv = shadowCoord.xy;
                vec2 f = fract(uv * shadowMapSize + 0.5);
                uv -= f * texelSize;
                
                shadow = (
                    texture2DCompare(shadowMap, uv, shadowCoord.z) +
                    texture2DCompare(shadowMap, uv + vec2(dx, 0.0), shadowCoord.z) +
                    texture2DCompare(shadowMap, uv + vec2(0.0, dy), shadowCoord.z) +
                    texture2DCompare(shadowMap, uv + texelSize, shadowCoord.z) +
                    mix(texture2DCompare(shadowMap, uv + vec2(-dx, 0.0), shadowCoord.z),
                        texture2DCompare(shadowMap, uv + vec2(2.0 * dx, 0.0), shadowCoord.z),
                        f.x) +
                    mix(texture2DCompare(shadowMap, uv + vec2(-dx, dy), shadowCoord.z),
                        texture2DCompare(shadowMap, uv + vec2(2.0 * dx, dy), shadowCoord.z),
                        f.x) +
                    mix(texture2DCompare(shadowMap, uv + vec2(0.0, -dy), shadowCoord.z),
                        texture2DCompare(shadowMap, uv + vec2(0.0, 2.0 * dy), shadowCoord.z),
                        f.y) +
                    mix(texture2DCompare(shadowMap, uv + vec2(dx, -dy), shadowCoord.z),
                        texture2DCompare(shadowMap, uv + vec2(dx, 2.0 * dy), shadowCoord.z),
                        f.y) +
                    mix(mix(texture2DCompare(shadowMap, uv + vec2(-dx, -dy), shadowCoord.z),
                            texture2DCompare(shadowMap, uv + vec2(2.0 * dx, -dy), shadowCoord.z),
                            f.x),
                        mix(texture2DCompare(shadowMap, uv + vec2(-dx, 2.0 * dy), shadowCoord.z),
                            texture2DCompare(shadowMap, uv + vec2(2.0 * dx, 2.0 * dy), shadowCoord.z),
                            f.x),
                        f.y)
                ) * (1.0 / 9.0);
            #elif defined( SHADOWMAP_TYPE_VSM )
                shadow = VSMShadow(shadowMap, shadowCoord.xy, shadowCoord.z);
            #else
                shadow = texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z);
            #endif
        }
        
        return shadow;
    }
    
    float terrainGetPointShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar) {
        // If shadows are disabled, always return 1.0 (full brightness, no shadow)
        if (!useShadows) {
            return 1.0;
        }
        
        // Otherwise use the standard point shadow calculation
        float shadow = 1.0;
        vec3 lightToPosition = shadowCoord.xyz;
        float lightDistanceSq = dot(lightToPosition, lightToPosition);
        float lightDistance = sqrt(lightDistanceSq);
        
        if (lightDistance < shadowCameraFar) {
            float dp = (lightDistance - shadowCameraNear) / (shadowCameraFar - shadowCameraNear);
            dp += shadowBias;
            
            vec3 bd3D = normalize(lightToPosition);
            vec2 texelSize = vec2(1.0) / shadowMapSize;
            
            #if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
                float offset = 1.0/32.0; // Hardcoded value for sampling the cube
                vec2 st = cubeToUV(bd3D, offset);
                shadow = texture2DCompare(shadowMap, st, dp);
            #else
                vec2 st = cubeToUV(bd3D, 1.0/32.0);
                shadow = texture2DCompare(shadowMap, st, dp);
            #endif
        }
        
        return shadow;
    }
    #endif

    // Override directional light shadows
    #if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        directionalLight = directionalLights[i];
        getDirectionalLightInfo(directionalLight, geometry, directLight);
        
        #if defined( USE_SHADOWMAP ) && ( i < NUM_DIR_LIGHT_SHADOWS )
        directionalLightShadow = directionalLightShadows[i];
        
        // Apply our custom shadow calculation that respects the toggle
        directLight.color *= (directLight.visible && receiveShadow) ? 
            terrainGetShadow(
                directionalShadowMap[i], 
                directionalLightShadow.shadowMapSize, 
                directionalLightShadow.shadowBias, 
                directionalLightShadow.shadowRadius, 
                vDirectionalShadowCoord[i]
            ) : 1.0;
        #endif
        
        RE_Direct(directLight, geometry, material, reflectedLight);
    }
    #pragma unroll_loop_end
    #endif
    
    // Override spot light shadows
    #if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
        spotLight = spotLights[i];
        getSpotLightInfo(spotLight, geometry, directLight);
        
        #if defined( USE_SHADOWMAP ) && ( i < NUM_SPOT_LIGHT_SHADOWS )
        spotLightShadow = spotLightShadows[i];
        
        // Apply our custom shadow calculation that respects the toggle
        directLight.color *= (directLight.visible && receiveShadow) ? 
            terrainGetShadow(
                spotShadowMap[i], 
                spotLightShadow.shadowMapSize, 
                spotLightShadow.shadowBias, 
                spotLightShadow.shadowRadius, 
                vSpotShadowCoord[i]
            ) : 1.0;
        #endif
        
        RE_Direct(directLight, geometry, material, reflectedLight);
    }
    #pragma unroll_loop_end
    #endif
    
    // Override point light shadows
    #if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        pointLight = pointLights[i];
        getPointLightInfo(pointLight, geometry, directLight);
        
        #if defined( USE_SHADOWMAP ) && ( i < NUM_POINT_LIGHT_SHADOWS )
        pointLightShadow = pointLightShadows[i];
        
        // Apply our custom shadow calculation that respects the toggle
        directLight.color *= (directLight.visible && receiveShadow) ? 
            terrainGetPointShadow(
                pointShadowMap[i], 
                pointLightShadow.shadowMapSize, 
                pointLightShadow.shadowBias, 
                pointLightShadow.shadowRadius, 
                vPointShadowCoord[i],
                pointLightShadow.shadowCameraNear,
                pointLightShadow.shadowCameraFar
            ) : 1.0;
        #endif
        
        RE_Direct(directLight, geometry, material, reflectedLight);
    }
    #pragma unroll_loop_end
    #endif
    
    // Process lights without shadows
    #if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_RECT_AREA_LIGHTS; i++) {
        rectAreaLight = rectAreaLights[i];
        RE_Direct_RectArea(rectAreaLight, geometry, material, reflectedLight);
    }
    #pragma unroll_loop_end
    #endif
    
    // Hemisphere and other light types
    #if ( NUM_HEMI_LIGHTS > 0 ) && defined( RE_Direct )
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
        hemisphereLightIrradiance = getHemisphereLightIrradiance(hemisphereLights[i], geometry.normal);
        irradiance += hemisphereLightIrradiance;
    }
    #pragma unroll_loop_end
    #endif

    #endif // USE_SHADOWMAP
#endif // RE_Direct 