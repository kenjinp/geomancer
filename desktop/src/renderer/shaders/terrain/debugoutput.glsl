----Vertex Shader Code----
 1:		#version 300 es
 2:		
 3:		#define attribute in
 4:		#define varying out
 5:		#define texture2D texture
 6:		precision highp float;
 7:		  precision highp int;
 8:		  precision highp sampler2D;
 9:		  precision highp samplerCube;
10:		  precision highp sampler3D;
11:		  precision highp sampler2DArray;
12:		  precision highp sampler2DShadow;
13:		  precision highp samplerCubeShadow;
14:		  precision highp sampler2DArrayShadow;
15:		  precision highp isampler2D;
16:		  precision highp isampler3D;
17:		  precision highp isamplerCube;
18:		  precision highp isampler2DArray;
19:		  precision highp usampler2D;
20:		  precision highp usampler3D;
21:		  precision highp usamplerCube;
22:		  precision highp usampler2DArray;
23:		  
24:		#define HIGH_PRECISION
25:		#define SHADER_TYPE MeshPhysicalMaterial
26:		#define SHADER_NAME CustomShaderMaterial<MeshPhysicalMaterial>
27:		#define STANDARD 
28:		#define PHYSICAL 
29:		#define USE_INSTANCING
30:		#define USE_LOGDEPTHBUF
31:		uniform mat4 modelMatrix;
32:		uniform mat4 modelViewMatrix;
33:		uniform mat4 projectionMatrix;
34:		uniform mat4 viewMatrix;
35:		uniform mat3 normalMatrix;
36:		uniform vec3 cameraPosition;
37:		uniform bool isOrthographic;
38:		#ifdef USE_INSTANCING
39:		  attribute mat4 instanceMatrix;
40:		#endif
41:		#ifdef USE_INSTANCING_COLOR
42:		  attribute vec3 instanceColor;
43:		#endif
44:		#ifdef USE_INSTANCING_MORPH
45:		  uniform sampler2D morphTexture;
46:		#endif
47:		attribute vec3 position;
48:		attribute vec3 normal;
49:		attribute vec2 uv;
50:		#ifdef USE_UV1
51:		  attribute vec2 uv1;
52:		#endif
53:		#ifdef USE_UV2
54:		  attribute vec2 uv2;
55:		#endif
56:		#ifdef USE_UV3
57:		  attribute vec2 uv3;
58:		#endif
59:		#ifdef USE_TANGENT
60:		  attribute vec4 tangent;
61:		#endif
62:		#if defined( USE_COLOR_ALPHA )
63:		  attribute vec4 color;
64:		#elif defined( USE_COLOR )
65:		  attribute vec3 color;
66:		#endif
67:		#ifdef USE_SKINNING
68:		  attribute vec4 skinIndex;
69:		  attribute vec4 skinWeight;
70:		#endif
71:		
72:		#define IS_MESHPHYSICALMATERIAL;
73:		#define IS_VERTEX
74:		#define STANDARD
75:		varying vec3 vViewPosition;
76:		#ifdef USE_TRANSMISSION
77:		  varying vec3 vWorldPosition;
78:		#endif
79:		#define PI 3.141592653589793
80:		#define PI2 6.283185307179586
81:		#define PI_HALF 1.5707963267948966
82:		#define RECIPROCAL_PI 0.3183098861837907
83:		#define RECIPROCAL_PI2 0.15915494309189535
84:		#define EPSILON 1e-6
85:		#ifndef saturate
86:		#define saturate( a ) clamp( a, 0.0, 1.0 )
87:		#endif
88:		#define whiteComplement( a ) ( 1.0 - saturate( a ) )
89:		float pow2( const in float x ) { return x*x; }
90:		vec3 pow2( const in vec3 x ) { return x*x; }
91:		float pow3( const in float x ) { return x*x*x; }
92:		float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
93:		float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
94:		float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
95:		highp float rand( const in vec2 uv ) {
96:		  const highp float a = 12.9898, b = 78.233, c = 43758.5453;
97:		  highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
98:		  return fract( sin( sn ) * c );
99:		}
100:		#ifdef HIGH_PRECISION
101:		  float precisionSafeLength( vec3 v ) { return length( v ); }
102:		#else
103:		  float precisionSafeLength( vec3 v ) {
104:		    float maxComponent = max3( abs( v ) );
105:		    return length( v / maxComponent ) * maxComponent;
106:		  }
107:		#endif
108:		struct IncidentLight {
109:		  vec3 color;
110:		  vec3 direction;
111:		  bool visible;
112:		};
113:		struct ReflectedLight {
114:		  vec3 directDiffuse;
115:		  vec3 directSpecular;
116:		  vec3 indirectDiffuse;
117:		  vec3 indirectSpecular;
118:		};
119:		#ifdef USE_ALPHAHASH
120:		  varying vec3 vPosition;
121:		#endif
122:		vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
123:		  return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
124:		}
125:		vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
126:		  return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
127:		}
128:		mat3 transposeMat3( const in mat3 m ) {
129:		  mat3 tmp;
130:		  tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
131:		  tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
132:		  tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
133:		  return tmp;
134:		}
135:		bool isPerspectiveMatrix( mat4 m ) {
136:		  return m[ 2 ][ 3 ] == - 1.0;
137:		}
138:		vec2 equirectUv( in vec3 dir ) {
139:		  float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
140:		  float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
141:		  return vec2( u, v );
142:		}
143:		vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
144:		  return RECIPROCAL_PI * diffuseColor;
145:		}
146:		vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
147:		  float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
148:		  return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
149:		}
150:		float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
151:		  float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
152:		  return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
153:		} // validated
154:		#ifdef USE_BATCHING
155:		  #if ! defined( GL_ANGLE_multi_draw )
156:		  #define gl_DrawID _gl_DrawID
157:		  uniform int _gl_DrawID;
158:		  #endif
159:		  uniform highp sampler2D batchingTexture;
160:		  uniform highp usampler2D batchingIdTexture;
161:		  mat4 getBatchingMatrix( const in float i ) {
162:		    int size = textureSize( batchingTexture, 0 ).x;
163:		    int j = int( i ) * 4;
164:		    int x = j % size;
165:		    int y = j / size;
166:		    vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
167:		    vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
168:		    vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
169:		    vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
170:		    return mat4( v1, v2, v3, v4 );
171:		  }
172:		  float getIndirectIndex( const in int i ) {
173:		    int size = textureSize( batchingIdTexture, 0 ).x;
174:		    int x = i % size;
175:		    int y = i / size;
176:		    return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
177:		  }
178:		#endif
179:		#ifdef USE_BATCHING_COLOR
180:		  uniform sampler2D batchingColorTexture;
181:		  vec3 getBatchingColor( const in float i ) {
182:		    int size = textureSize( batchingColorTexture, 0 ).x;
183:		    int j = int( i );
184:		    int x = j % size;
185:		    int y = j / size;
186:		    return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
187:		  }
188:		#endif
189:		#if defined( USE_UV ) || defined( USE_ANISOTROPY )
190:		  varying vec2 vUv;
191:		#endif
192:		#ifdef USE_MAP
193:		  uniform mat3 mapTransform;
194:		  varying vec2 vMapUv;
195:		#endif
196:		#ifdef USE_ALPHAMAP
197:		  uniform mat3 alphaMapTransform;
198:		  varying vec2 vAlphaMapUv;
199:		#endif
200:		#ifdef USE_LIGHTMAP
201:		  uniform mat3 lightMapTransform;
202:		  varying vec2 vLightMapUv;
203:		#endif
204:		#ifdef USE_AOMAP
205:		  uniform mat3 aoMapTransform;
206:		  varying vec2 vAoMapUv;
207:		#endif
208:		#ifdef USE_BUMPMAP
209:		  uniform mat3 bumpMapTransform;
210:		  varying vec2 vBumpMapUv;
211:		#endif
212:		#ifdef USE_NORMALMAP
213:		  uniform mat3 normalMapTransform;
214:		  varying vec2 vNormalMapUv;
215:		#endif
216:		#ifdef USE_DISPLACEMENTMAP
217:		  uniform mat3 displacementMapTransform;
218:		  varying vec2 vDisplacementMapUv;
219:		#endif
220:		#ifdef USE_EMISSIVEMAP
221:		  uniform mat3 emissiveMapTransform;
222:		  varying vec2 vEmissiveMapUv;
223:		#endif
224:		#ifdef USE_METALNESSMAP
225:		  uniform mat3 metalnessMapTransform;
226:		  varying vec2 vMetalnessMapUv;
227:		#endif
228:		#ifdef USE_ROUGHNESSMAP
229:		  uniform mat3 roughnessMapTransform;
230:		  varying vec2 vRoughnessMapUv;
231:		#endif
232:		#ifdef USE_ANISOTROPYMAP
233:		  uniform mat3 anisotropyMapTransform;
234:		  varying vec2 vAnisotropyMapUv;
235:		#endif
236:		#ifdef USE_CLEARCOATMAP
237:		  uniform mat3 clearcoatMapTransform;
238:		  varying vec2 vClearcoatMapUv;
239:		#endif
240:		#ifdef USE_CLEARCOAT_NORMALMAP
241:		  uniform mat3 clearcoatNormalMapTransform;
242:		  varying vec2 vClearcoatNormalMapUv;
243:		#endif
244:		#ifdef USE_CLEARCOAT_ROUGHNESSMAP
245:		  uniform mat3 clearcoatRoughnessMapTransform;
246:		  varying vec2 vClearcoatRoughnessMapUv;
247:		#endif
248:		#ifdef USE_SHEEN_COLORMAP
249:		  uniform mat3 sheenColorMapTransform;
250:		  varying vec2 vSheenColorMapUv;
251:		#endif
252:		#ifdef USE_SHEEN_ROUGHNESSMAP
253:		  uniform mat3 sheenRoughnessMapTransform;
254:		  varying vec2 vSheenRoughnessMapUv;
255:		#endif
256:		#ifdef USE_IRIDESCENCEMAP
257:		  uniform mat3 iridescenceMapTransform;
258:		  varying vec2 vIridescenceMapUv;
259:		#endif
260:		#ifdef USE_IRIDESCENCE_THICKNESSMAP
261:		  uniform mat3 iridescenceThicknessMapTransform;
262:		  varying vec2 vIridescenceThicknessMapUv;
263:		#endif
264:		#ifdef USE_SPECULARMAP
265:		  uniform mat3 specularMapTransform;
266:		  varying vec2 vSpecularMapUv;
267:		#endif
268:		#ifdef USE_SPECULAR_COLORMAP
269:		  uniform mat3 specularColorMapTransform;
270:		  varying vec2 vSpecularColorMapUv;
271:		#endif
272:		#ifdef USE_SPECULAR_INTENSITYMAP
273:		  uniform mat3 specularIntensityMapTransform;
274:		  varying vec2 vSpecularIntensityMapUv;
275:		#endif
276:		#ifdef USE_TRANSMISSIONMAP
277:		  uniform mat3 transmissionMapTransform;
278:		  varying vec2 vTransmissionMapUv;
279:		#endif
280:		#ifdef USE_THICKNESSMAP
281:		  uniform mat3 thicknessMapTransform;
282:		  varying vec2 vThicknessMapUv;
283:		#endif
284:		#ifdef USE_DISPLACEMENTMAP
285:		  uniform sampler2D displacementMap;
286:		  uniform float displacementScale;
287:		  uniform float displacementBias;
288:		#endif
289:		#if defined( USE_COLOR_ALPHA )
290:		  varying vec4 vColor;
291:		#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
292:		  varying vec3 vColor;
293:		#endif
294:		#ifdef USE_FOG
295:		  varying float vFogDepth;
296:		#endif
297:		#ifndef FLAT_SHADED
298:		  varying vec3 vNormal;
299:		  #ifdef USE_TANGENT
300:		    varying vec3 vTangent;
301:		    varying vec3 vBitangent;
302:		  #endif
303:		#endif
304:		#ifdef USE_MORPHTARGETS
305:		  #ifndef USE_INSTANCING_MORPH
306:		    uniform float morphTargetBaseInfluence;
307:		    uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
308:		  #endif
309:		  uniform sampler2DArray morphTargetsTexture;
310:		  uniform ivec2 morphTargetsTextureSize;
311:		  vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
312:		    int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
313:		    int y = texelIndex / morphTargetsTextureSize.x;
314:		    int x = texelIndex - y * morphTargetsTextureSize.x;
315:		    ivec3 morphUV = ivec3( x, y, morphTargetIndex );
316:		    return texelFetch( morphTargetsTexture, morphUV, 0 );
317:		  }
318:		#endif
319:		#ifdef USE_SKINNING
320:		  uniform mat4 bindMatrix;
321:		  uniform mat4 bindMatrixInverse;
322:		  uniform highp sampler2D boneTexture;
323:		  mat4 getBoneMatrix( const in float i ) {
324:		    int size = textureSize( boneTexture, 0 ).x;
325:		    int j = int( i ) * 4;
326:		    int x = j % size;
327:		    int y = j / size;
328:		    vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
329:		    vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
330:		    vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
331:		    vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
332:		    return mat4( v1, v2, v3, v4 );
333:		  }
334:		#endif
335:		#if 0 > 0
336:		  uniform mat4 spotLightMatrix[ 0 ];
337:		  varying vec4 vSpotLightCoord[ 0 ];
338:		#endif
339:		#ifdef USE_SHADOWMAP
340:		  #if 0 > 0
341:		    uniform mat4 directionalShadowMatrix[ 0 ];
342:		    varying vec4 vDirectionalShadowCoord[ 0 ];
343:		    struct DirectionalLightShadow {
344:		      float shadowIntensity;
345:		      float shadowBias;
346:		      float shadowNormalBias;
347:		      float shadowRadius;
348:		      vec2 shadowMapSize;
349:		    };
350:		    uniform DirectionalLightShadow directionalLightShadows[ 0 ];
351:		  #endif
352:		  #if 0 > 0
353:		    struct SpotLightShadow {
354:		      float shadowIntensity;
355:		      float shadowBias;
356:		      float shadowNormalBias;
357:		      float shadowRadius;
358:		      vec2 shadowMapSize;
359:		    };
360:		    uniform SpotLightShadow spotLightShadows[ 0 ];
361:		  #endif
362:		  #if 0 > 0
363:		    uniform mat4 pointShadowMatrix[ 0 ];
364:		    varying vec4 vPointShadowCoord[ 0 ];
365:		    struct PointLightShadow {
366:		      float shadowIntensity;
367:		      float shadowBias;
368:		      float shadowNormalBias;
369:		      float shadowRadius;
370:		      vec2 shadowMapSize;
371:		      float shadowCameraNear;
372:		      float shadowCameraFar;
373:		    };
374:		    uniform PointLightShadow pointLightShadows[ 0 ];
375:		  #endif
376:		#endif
377:		#ifdef USE_LOGDEPTHBUF
378:		  varying float vFragDepth;
379:		  varying float vIsPerspective;
380:		#endif
381:		#if 0 > 0
382:		  varying vec3 vClipPosition;
383:		#endif
384:		
385:		          // THREE-CustomShaderMaterial by Faraz Shaikh: https://github.com/FarazzShaikh/THREE-CustomShaderMaterial
386:		  
387:		          //~CSM_DEFAULTS
388:		          
389:		    varying mat4 csm_internal_vModelViewMatrix;
390:		
391:		          
392:		    
393:		#ifdef IS_VERTEX
394:		    vec3 csm_Position;
395:		    vec4 csm_PositionRaw;
396:		    vec3 csm_Normal;
397:		
398:		    // csm_PointSize
399:		    #ifdef IS_POINTSMATERIAL
400:		        float csm_PointSize;
401:		    #endif
402:		#else
403:		    vec4 csm_DiffuseColor;
404:		    vec4 csm_FragColor;
405:		    float csm_UnlitFac;
406:		
407:		    // csm_Emissive, csm_Roughness, csm_Metalness
408:		    #if defined IS_MESHSTANDARDMATERIAL || defined IS_MESHPHYSICALMATERIAL
409:		        vec3 csm_Emissive;
410:		        float csm_Roughness;
411:		        float csm_Metalness;
412:		        float csm_Iridescence;
413:		        
414:		        #if defined IS_MESHPHYSICALMATERIAL
415:		            float csm_Clearcoat;
416:		            float csm_ClearcoatRoughness;
417:		            vec3 csm_ClearcoatNormal;
418:		            float csm_Transmission;
419:		            float csm_Thickness;
420:		        #endif
421:		    #endif
422:		
423:		    // csm_AO
424:		    #if defined IS_MESHSTANDARDMATERIAL || defined IS_MESHPHYSICALMATERIAL || defined IS_MESHBASICMATERIAL || defined IS_MESHLAMBERTMATERIAL || defined IS_MESHPHONGMATERIAL || defined IS_MESHTOONMATERIAL
425:		        float csm_AO;
426:		    #endif
427:		
428:		    // csm_Bump
429:		    #if defined IS_MESHLAMBERTMATERIAL || defined IS_MESHMATCAPMATERIAL || defined IS_MESHNORMALMATERIAL || defined IS_MESHPHONGMATERIAL || defined IS_MESHPHYSICALMATERIAL || defined IS_MESHSTANDARDMATERIAL || defined IS_MESHTOONMATERIAL || defined IS_SHADOWMATERIAL 
430:		        vec3 csm_Bump;
431:		        vec3 csm_FragNormal;
432:		    #endif
433:		
434:		    float csm_DepthAlpha;
435:		#endif
436:		
437:		  
438:		          varying vec2 vUv;
439:		uniform float uRadius;
440:		uniform vec3 uOffset;
441:		varying vec4 vWorldPosition;
442:		varying float vInstanceId;
443:		varying vec3 vColor;
444:		
445:		
446:		          
447:		          void main() {
448:		            {
449:		              
450:		
451:		#ifdef IS_VERTEX
452:		    // csm_Position & csm_PositionRaw
453:		    #ifdef IS_UNKNOWN
454:		        csm_Position = vec3(0.0);
455:		        csm_PositionRaw = vec4(0.0);
456:		        csm_Normal = vec3(0.0);
457:		    #else
458:		        csm_Position = position;
459:		        csm_PositionRaw = projectionMatrix * modelViewMatrix * vec4(position, 1.);
460:		        csm_Normal = normal;
461:		    #endif
462:		
463:		    // csm_PointSize
464:		    #ifdef IS_POINTSMATERIAL
465:		        csm_PointSize = size;
466:		    #endif
467:		#else
468:		    csm_UnlitFac = 0.0;
469:		
470:		    // csm_DiffuseColor & csm_FragColor
471:		    #if defined IS_UNKNOWN || defined IS_SHADERMATERIAL || defined IS_MESHDEPTHMATERIAL || defined IS_MESHDISTANCEMATERIAL || defined IS_MESHNORMALMATERIAL || defined IS_SHADOWMATERIAL
472:		        csm_DiffuseColor = vec4(1.0, 0.0, 1.0, 1.0);
473:		        csm_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
474:		    #else
475:		        #ifdef USE_MAP
476:		            vec4 _csm_sampledDiffuseColor = texture2D(map, vMapUv);
477:		
478:		            #ifdef DECODE_VIDEO_TEXTURE
479:		            // inline sRGB decode (TODO: Remove this code when https://crbug.com/1256340 is solved)
480:		            _csm_sampledDiffuseColor = vec4(mix(pow(_csm_sampledDiffuseColor.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), _csm_sampledDiffuseColor.rgb * 0.0773993808, vec3(lessThanEqual(_csm_sampledDiffuseColor.rgb, vec3(0.04045)))), _csm_sampledDiffuseColor.w);
481:		            #endif
482:		
483:		            csm_DiffuseColor = vec4(diffuse, opacity) * _csm_sampledDiffuseColor;
484:		            csm_FragColor = vec4(diffuse, opacity) * _csm_sampledDiffuseColor;
485:		        #else
486:		            csm_DiffuseColor = vec4(diffuse, opacity);
487:		            csm_FragColor = vec4(diffuse, opacity);
488:		        #endif
489:		    #endif
490:		
491:		    // csm_Emissive, csm_Roughness, csm_Metalness
492:		    #if defined IS_MESHSTANDARDMATERIAL || defined IS_MESHPHYSICALMATERIAL
493:		        csm_Emissive = emissive;
494:		        csm_Roughness = roughness;
495:		        csm_Metalness = metalness;
496:		
497:		        #ifdef USE_IRIDESCENCE
498:		            csm_Iridescence = iridescence;
499:		        #else
500:		            csm_Iridescence = 0.0;
501:		        #endif
502:		
503:		        #if defined IS_MESHPHYSICALMATERIAL
504:		            #ifdef USE_CLEARCOAT
505:		                csm_Clearcoat = clearcoat;
506:		                csm_ClearcoatRoughness = clearcoatRoughness;
507:		            #else
508:		                csm_Clearcoat = 0.0;
509:		                csm_ClearcoatRoughness = 0.0;
510:		            #endif
511:		
512:		            #ifdef USE_TRANSMISSION
513:		                csm_Transmission = transmission;
514:		                csm_Thickness = thickness;
515:		            #else
516:		                csm_Transmission = 0.0;
517:		                csm_Thickness = 0.0;
518:		            #endif
519:		        #endif
520:		    #endif
521:		
522:		    // csm_AO
523:		    #if defined IS_MESHSTANDARDMATERIAL || defined IS_MESHPHYSICALMATERIAL || defined IS_MESHBASICMATERIAL || defined IS_MESHLAMBERTMATERIAL || defined IS_MESHPHONGMATERIAL || defined IS_MESHTOONMATERIAL
524:		        csm_AO = 0.0;
525:		    #endif
526:		
527:		    // csm_Bump
528:		    #if defined IS_MESHLAMBERTMATERIAL || defined IS_MESHMATCAPMATERIAL || defined IS_MESHNORMALMATERIAL || defined IS_MESHPHONGMATERIAL || defined IS_MESHPHYSICALMATERIAL || defined IS_MESHSTANDARDMATERIAL || defined IS_MESHTOONMATERIAL || defined IS_SHADOWMATERIAL 
529:		        csm_Bump = vec3(0.0);
530:		        #ifdef FLAT_SHADED
531:		            vec3 fdx = dFdx( vViewPosition );
532:		            vec3 fdy = dFdy( vViewPosition );
533:		            csm_FragNormal = normalize( cross( fdx, fdy ) );
534:		        #else
535:		            csm_FragNormal = normalize(vNormal);
536:		            #ifdef DOUBLE_SIDED
537:		                csm_FragNormal *= gl_FrontFacing ? 1.0 : - 1.0;
538:		            #endif
539:		        #endif
540:		    #endif
541:		
542:		    csm_DepthAlpha = 1.0;
543:		#endif
544:		
545:		            }
546:		            
547:		    csm_internal_vModelViewMatrix = modelViewMatrix;
548:		
549:		
550:		            
551:		    
552:		    vInstanceId = float(gl_InstanceID);
553:		    
554:		    
555:		    vec4 instancedPosition = instanceMatrix * vec4(position, 1.0);
556:		    vec4 worldPosition = modelMatrix * instancedPosition;
557:		    vec3 sphereDirection = normalize(worldPosition.xyz - uOffset);
558:		    vec3 spherePosition = uOffset + sphereDirection * uRadius;
559:		    
560:		    
561:		    vWorldPosition = vec4(spherePosition, 1.0);
562:		    
563:		    
564:		    vec4 clipPosition = projectionMatrix * viewMatrix * vec4(spherePosition, 1.0);
565:		    
566:		    
567:		    csm_PositionRaw = clipPosition;
568:		    
569:		    vUv = uv;
570:		
571:		            //~CSM_MAIN_END
572:		          
573:		#if defined( USE_UV ) || defined( USE_ANISOTROPY )
574:		  vUv = vec3( uv, 1 ).xy;
575:		#endif
576:		#ifdef USE_MAP
577:		  vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
578:		#endif
579:		#ifdef USE_ALPHAMAP
580:		  vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
581:		#endif
582:		#ifdef USE_LIGHTMAP
583:		  vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
584:		#endif
585:		#ifdef USE_AOMAP
586:		  vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
587:		#endif
588:		#ifdef USE_BUMPMAP
589:		  vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
590:		#endif
591:		#ifdef USE_NORMALMAP
592:		  vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
593:		#endif
594:		#ifdef USE_DISPLACEMENTMAP
595:		  vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
596:		#endif
597:		#ifdef USE_EMISSIVEMAP
598:		  vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
599:		#endif
600:		#ifdef USE_METALNESSMAP
601:		  vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
602:		#endif
603:		#ifdef USE_ROUGHNESSMAP
604:		  vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
605:		#endif
606:		#ifdef USE_ANISOTROPYMAP
607:		  vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
608:		#endif
609:		#ifdef USE_CLEARCOATMAP
610:		  vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
611:		#endif
612:		#ifdef USE_CLEARCOAT_NORMALMAP
613:		  vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
614:		#endif
615:		#ifdef USE_CLEARCOAT_ROUGHNESSMAP
616:		  vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
617:		#endif
618:		#ifdef USE_IRIDESCENCEMAP
619:		  vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
620:		#endif
621:		#ifdef USE_IRIDESCENCE_THICKNESSMAP
622:		  vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
623:		#endif
624:		#ifdef USE_SHEEN_COLORMAP
625:		  vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
626:		#endif
627:		#ifdef USE_SHEEN_ROUGHNESSMAP
628:		  vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
629:		#endif
630:		#ifdef USE_SPECULARMAP
631:		  vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
632:		#endif
633:		#ifdef USE_SPECULAR_COLORMAP
634:		  vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
635:		#endif
636:		#ifdef USE_SPECULAR_INTENSITYMAP
637:		  vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
638:		#endif
639:		#ifdef USE_TRANSMISSIONMAP
640:		  vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
641:		#endif
642:		#ifdef USE_THICKNESSMAP
643:		  vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
644:		#endif
645:		#if defined( USE_COLOR_ALPHA )
646:		  vColor = vec4( 1.0 );
647:		#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
648:		  vColor = vec3( 1.0 );
649:		#endif
650:		#ifdef USE_COLOR
651:		  vColor *= color;
652:		#endif
653:		#ifdef USE_INSTANCING_COLOR
654:		  vColor.xyz *= instanceColor.xyz;
655:		#endif
656:		#ifdef USE_BATCHING_COLOR
657:		  vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
658:		  vColor.xyz *= batchingColor.xyz;
659:		#endif
660:		#ifdef USE_INSTANCING_MORPH
661:		  float morphTargetInfluences[ MORPHTARGETS_COUNT ];
662:		  float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
663:		  for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
664:		    morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
665:		  }
666:		#endif
667:		#if defined( USE_MORPHCOLORS )
668:		  vColor *= morphTargetBaseInfluence;
669:		  for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
670:		    #if defined( USE_COLOR_ALPHA )
671:		      if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
672:		    #elif defined( USE_COLOR )
673:		      if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
674:		    #endif
675:		  }
676:		#endif
677:		#ifdef USE_BATCHING
678:		  mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
679:		#endif
680:		vec3 objectNormal = vec3( normal );
681:		#ifdef USE_TANGENT
682:		  vec3 objectTangent = vec3( tangent.xyz );
683:		#endif
684:		#ifdef USE_MORPHNORMALS
685:		  objectNormal *= morphTargetBaseInfluence;
686:		  for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
687:		    if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
688:		  }
689:		#endif
690:		#ifdef USE_SKINNING
691:		  mat4 boneMatX = getBoneMatrix( skinIndex.x );
692:		  mat4 boneMatY = getBoneMatrix( skinIndex.y );
693:		  mat4 boneMatZ = getBoneMatrix( skinIndex.z );
694:		  mat4 boneMatW = getBoneMatrix( skinIndex.w );
695:		#endif
696:		#ifdef USE_SKINNING
697:		  mat4 skinMatrix = mat4( 0.0 );
698:		  skinMatrix += skinWeight.x * boneMatX;
699:		  skinMatrix += skinWeight.y * boneMatY;
700:		  skinMatrix += skinWeight.z * boneMatZ;
701:		  skinMatrix += skinWeight.w * boneMatW;
702:		  skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
703:		  objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
704:		  #ifdef USE_TANGENT
705:		    objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
706:		  #endif
707:		#endif
708:		vec3 transformedNormal = objectNormal;
709:		#ifdef USE_TANGENT
710:		  vec3 transformedTangent = objectTangent;
711:		#endif
712:		#ifdef USE_BATCHING
713:		  mat3 bm = mat3( batchingMatrix );
714:		  transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
715:		  transformedNormal = bm * transformedNormal;
716:		  #ifdef USE_TANGENT
717:		    transformedTangent = bm * transformedTangent;
718:		  #endif
719:		#endif
720:		#ifdef USE_INSTANCING
721:		  mat3 im = mat3( instanceMatrix );
722:		  transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
723:		  transformedNormal = im * transformedNormal;
724:		  #ifdef USE_TANGENT
725:		    transformedTangent = im * transformedTangent;
726:		  #endif
727:		#endif
728:		transformedNormal = normalMatrix * transformedNormal;
729:		#ifdef FLIP_SIDED
730:		  transformedNormal = - transformedNormal;
731:		#endif
732:		#ifdef USE_TANGENT
733:		  transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
734:		  #ifdef FLIP_SIDED
735:		    transformedTangent = - transformedTangent;
736:		  #endif
737:		#endif
738:		#ifndef FLAT_SHADED
739:		  vNormal = normalize( transformedNormal );
740:		  #ifdef USE_TANGENT
741:		    vTangent = normalize( transformedTangent );
742:		    vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
743:		  #endif
744:		#endif
745:		  
746:		    vec3 transformed = csm_Position;
747:		  
748:		#ifdef USE_MORPHTARGETS
749:		  transformed *= morphTargetBaseInfluence;
750:		  for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
751:		    if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
752:		  }
753:		#endif
754:		#ifdef USE_SKINNING
755:		  vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
756:		  vec4 skinned = vec4( 0.0 );
757:		  skinned += boneMatX * skinVertex * skinWeight.x;
758:		  skinned += boneMatY * skinVertex * skinWeight.y;
759:		  skinned += boneMatZ * skinVertex * skinWeight.z;
760:		  skinned += boneMatW * skinVertex * skinWeight.w;
761:		  transformed = ( bindMatrixInverse * skinned ).xyz;
762:		#endif
763:		#ifdef USE_DISPLACEMENTMAP
764:		  transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
765:		#endif
766:		vec4 mvPosition = vec4( transformed, 1.0 );
767:		#ifdef USE_BATCHING
768:		  mvPosition = batchingMatrix * mvPosition;
769:		#endif
770:		#ifdef USE_INSTANCING
771:		  mvPosition = instanceMatrix * mvPosition;
772:		#endif
773:		mvPosition = modelViewMatrix * mvPosition;
774:		gl_Position = projectionMatrix * mvPosition;
775:		#ifdef USE_LOGDEPTHBUF
776:		  vFragDepth = 1.0 + gl_Position.w;
777:		  vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
778:		#endif
779:		#if 0 > 0
780:		  vClipPosition = - mvPosition.xyz;
781:		#endif
782:		  vViewPosition = - mvPosition.xyz;
783:		#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || 0 > 0
784:		  vec4 worldPosition = vec4( transformed, 1.0 );
785:		  #ifdef USE_BATCHING
786:		    worldPosition = batchingMatrix * worldPosition;
787:		  #endif
788:		  #ifdef USE_INSTANCING
789:		    worldPosition = instanceMatrix * worldPosition;
790:		  #endif
791:		  worldPosition = modelMatrix * worldPosition;
792:		#endif
793:		#if ( defined( USE_SHADOWMAP ) && ( 0 > 0 || 0 > 0 ) ) || ( 0 > 0 )
794:		  vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
795:		  vec4 shadowWorldPosition;
796:		#endif
797:		#if defined( USE_SHADOWMAP )
798:		  #if 0 > 0
799:		    
800:		  #endif
801:		  #if 0 > 0
802:		    
803:		  #endif
804:		#endif
805:		#if 0 > 0
806:		  
807:		#endif
808:		#ifdef USE_FOG
809:		  vFogDepth = - mvPosition.z;
810:		#endif
811:		#ifdef USE_TRANSMISSION
812:		  vWorldPosition = worldPosition.xyz;
813:		#endif
814:		}