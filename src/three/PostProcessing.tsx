import { EffectComposer, DepthOfField } from '@react-three/postprocessing';

export function PostProcessing() {
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField
        target={[0, 0, -3.7]}
        focalLength={0.06}
        bokehScale={3.2}
        resolutionScale={0.5}
      />
    </EffectComposer>
  );
}
