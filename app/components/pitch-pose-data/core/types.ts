/**
 * 3D 骨架模組的共用型別與 COCO-17 骨架拓樸。
 *
 * 座標系（同 pitch-trajectory）：x = 左右（捕手視角）、y = 投手方向距離、z = 高度，單位 cm。
 */

/** 世界座標點 [x, y, z]（cm）。 */
export type Point3D = [number, number, number]

/**
 * COCO-17 keypoint 定義順序，對應 mmpose COCO
 * （https://mmpose.readthedocs.io/en/latest/dataset_zoo/2d_body_keypoint.html#coco）。
 * outcome.json 的 pose_3d key（"0"~"16"）即此索引。
 */
export const COCO_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const

/**
 * 骨架拓樸（標準 COCO skeleton，0-indexed）。
 * 一條邊要「兩端點都有座標」才繪製。
 */
export const SKELETON_EDGES: ReadonlyArray<readonly [number, number]> = [
  // 臉部
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [2, 4],
  // 耳 → 肩（頭與軀幹的視覺連接）
  [3, 5],
  [4, 6],
  // 軀幹
  [5, 6],
  [5, 11],
  [6, 12],
  [11, 12],
  // 左臂 / 右臂
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  // 左腿 / 右腿
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
]
