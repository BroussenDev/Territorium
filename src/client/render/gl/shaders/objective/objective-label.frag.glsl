#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uTex; // white glyphs on a dark outline
uniform vec3 uColor;
uniform float uAlpha;

out vec4 fragColor;

void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.003) discard;
  fragColor = vec4(uColor * t.r, t.a * uAlpha);
}
