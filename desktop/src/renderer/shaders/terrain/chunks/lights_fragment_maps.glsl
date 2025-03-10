#if defined( RE_Direct )

	#ifdef USE_SHADOWMAP

    // If map layer 2 is NOT enabled, apply shadows normally
    if (!getMapLayer(2u)) {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      return;
        DirectionalLight directionalLight;
        #if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

            directionalLight = directionalLights[ i ];

            // Apply shadows for directional lights
            getDirectionalLightInfo( directionalLight, geometry, directLight );
            #if defined( USE_SHADOWMAP ) && ( i < NUM_DIR_LIGHT_SHADOWS )
            directionalLightShadow = directionalLightShadows[ i ];
            directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
            #endif

            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end

        #endif

        SpotLight spotLight;
        #if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

            spotLight = spotLights[ i ];

            getSpotLightInfo( spotLight, geometry, directLight );
            #if defined( USE_SHADOWMAP ) && ( i < NUM_SPOT_LIGHT_SHADOWS )
            spotLightShadow = spotLightShadows[ i ];
            directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
            #endif

            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end

        #endif

        PointLight pointLight;
        #if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

            pointLight = pointLights[ i ];

            getPointLightInfo( pointLight, geometry, directLight );
            #if defined( USE_SHADOWMAP ) && ( i < NUM_POINT_LIGHT_SHADOWS )
            pointLightShadow = pointLightShadows[ i ];
            directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
            #endif

            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end

        #endif

        // Lights without shadows
        LightMapLight lightMapLight;
        #if ( NUM_LIGHTMAP_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_LIGHTMAP_LIGHTS; i ++ ) {

            lightMapLight = lightMapLights[ i ];
            RE_Direct( lightMapLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end

        #endif
    } else {
        // If map layer 2 IS enabled, skip shadows completely but still apply direct lighting
        DirectionalLight directionalLight;
        #if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            directionalLight = directionalLights[ i ];
            getDirectionalLightInfo( directionalLight, geometry, directLight );
            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end
        #endif

        SpotLight spotLight;
        #if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
            spotLight = spotLights[ i ];
            getSpotLightInfo( spotLight, geometry, directLight );
            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end
        #endif

        PointLight pointLight;
        #if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
            pointLight = pointLights[ i ];
            getPointLightInfo( pointLight, geometry, directLight );
            RE_Direct( directLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end
        #endif

        LightMapLight lightMapLight;
        #if ( NUM_LIGHTMAP_LIGHTS > 0 ) && defined( RE_Direct )

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_LIGHTMAP_LIGHTS; i ++ ) {
            lightMapLight = lightMapLights[ i ];
            RE_Direct( lightMapLight, geometry, material, reflectedLight );
        }
        #pragma unroll_loop_end
        #endif
    }

	#endif

#endif 