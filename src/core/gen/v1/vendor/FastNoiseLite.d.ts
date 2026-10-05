// Hand-written minimal declarations for the vendored FastNoiseLite 1.1.1.
// The JS file is pristine upstream source and is never edited (C-10).
declare class FastNoiseLite {
  constructor(seed?: number);
  SetSeed(seed: number): void;
  SetFrequency(frequency: number): void;
  SetNoiseType(noiseType: string): void;
  SetRotationType3D(rotationType3D: string): void;
  SetFractalType(fractalType: string): void;
  SetFractalOctaves(octaves: number): void;
  SetFractalLacunarity(lacunarity: number): void;
  SetFractalGain(gain: number): void;
  SetFractalWeightedStrength(weightedStrength: number): void;
  GetNoise(x: number, y: number, z?: number): number;
  static NoiseType: {
    OpenSimplex2: string;
    OpenSimplex2S: string;
    Cellular: string;
    Perlin: string;
    ValueCubic: string;
    Value: string;
  };
  static FractalType: {
    None: string;
    FBm: string;
    Ridged: string;
    PingPong: string;
    DomainWarpProgressive: string;
    DomainWarpIndependent: string;
  };
  static RotationType3D: { None: string; ImproveXYPlanes: string; ImproveXZPlanes: string };
}
export default FastNoiseLite;
