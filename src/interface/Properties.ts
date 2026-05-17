export interface Properties {
  // General
  trust_state: boolean | null;
  // Speed (CF)
  max_speed: number | null;
  // Feature toggles (CF, LT) — false means the feature is disabled
  feature_light?: boolean;
  feature_brightness?: boolean;
  feature_up_down_light?: boolean;
  // Shades (MS)
  open_raises?: boolean;
  open_retracts?: boolean;
  course_time?: number;
  // Color temperature (LT)
  max_color_temp?: number;
  min_color_temp?: number;
}
