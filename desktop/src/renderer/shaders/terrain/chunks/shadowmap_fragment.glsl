#ifdef USE_SHADOWMAP
  // This is a direct replacement for Three.js's shadowmap_fragment.glsl chunk
  // that will completely override the shadow application based on our custom uniform
  
  // Skip all shadow calculations if our custom flag says to
  #ifdef receiveShadow
    float shadowFactor = 1.0;
    
    // CUSTOM OVERRIDE: Check our own uniform to decide whether to apply shadows
    // If we have uReceiveShadow defined and it's 0, skip all shadow calculations
    #if defined uReceiveShadow
      if (uReceiveShadow < 0.5) {
        // If shadows are disabled, set shadowFactor to 1.0 (full brightness, no shadows)
        shadowFactor = 1.0;
      } else {
        // Otherwise, proceed with normal shadows
        #if NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow directionalLight;
          
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
            directionalLight = directionalLightShadows[i];
            shadowFactor = all(bvec2(directionalLight.visible, receiveShadow)) ? 
              getShadow(
                directionalShadowMap[i],
                directionalLight.shadowMapSize,
                directionalLight.shadowBias,
                directionalLight.shadowRadius,
                vDirectionalShadowCoord[i]
              ) : 1.0;
            
            ReflectedLight_directDiffuse += (1.0 - shadowFactor) * directionalLights[i].color * BRDF_Lambert(diffuseColor.rgb) * directionalLight.visible;
          }
          #pragma unroll_loop_end
        #endif
        
        #if NUM_SPOT_LIGHT_SHADOWS > 0
          SpotLightShadow spotLight;
          
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i++) {
            spotLight = spotLightShadows[i];
            shadowFactor = all(bvec2(spotLight.visible, receiveShadow)) ?
              getShadow(
                spotShadowMap[i],
                spotLight.shadowMapSize,
                spotLight.shadowBias,
                spotLight.shadowRadius,
                vSpotShadowCoord[i]
              ) : 1.0;
              
            ReflectedLight_directDiffuse += (1.0 - shadowFactor) * spotLights[i].color * BRDF_Lambert(diffuseColor.rgb) * spotLight.visible;
          }
          #pragma unroll_loop_end
        #endif
        
        #if NUM_POINT_LIGHT_SHADOWS > 0
          PointLightShadow pointLight;
          
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i++) {
            pointLight = pointLightShadows[i];
            shadowFactor = all(bvec2(pointLight.visible, receiveShadow)) ?
              getPointShadow(
                pointShadowMap[i],
                pointLight.shadowMapSize,
                pointLight.shadowBias,
                pointLight.shadowRadius,
                vPointShadowCoord[i],
                pointLight.shadowCameraNear,
                pointLight.shadowCameraFar
              ) : 1.0;
              
            ReflectedLight_directDiffuse += (1.0 - shadowFactor) * pointLights[i].color * BRDF_Lambert(diffuseColor.rgb) * pointLight.visible;
          }
          #pragma unroll_loop_end
        #endif
      }
    #else
      // Original Three.js shadow implementation if we don't have our custom uniform
      #if NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow directionalLight;
        
        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
          directionalLight = directionalLightShadows[i];
          shadowFactor = all(bvec2(directionalLight.visible, receiveShadow)) ? 
            getShadow(
              directionalShadowMap[i],
              directionalLight.shadowMapSize,
              directionalLight.shadowBias,
              directionalLight.shadowRadius,
              vDirectionalShadowCoord[i]
            ) : 1.0;
          
          ReflectedLight_directDiffuse += (1.0 - shadowFactor) * directionalLights[i].color * BRDF_Lambert(diffuseColor.rgb) * directionalLight.visible;
        }
        #pragma unroll_loop_end
      #endif
    #endif
  #endif
#endif 