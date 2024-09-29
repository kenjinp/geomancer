Shader "Unlit/BlueNoisePreviewer"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "black" {}
        _Threshold("Threshold", Range(0.0, 1.0)) = 0.0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 100

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            // make fog work
            #pragma multi_compile_fog

            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float2 uv : TEXCOORD0;
                float4 vertex : SV_POSITION;
            };

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float _Threshold;

            v2f vert (appdata v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return o;
            }

            float4 frag (v2f i) : SV_Target
            {
                // sample the texture
                float sample = tex2D(_MainTex, i.uv).r;
                sample = sample >= _Threshold ? sample : 0; 
                // float3 col = tex2D(_MainTex, i.uv).rrr;
                return float4(sample.xxx, 1.0);
            }
            ENDCG
        }
    }
}
