// ros3djs ships no TypeScript types. The 3D viewer is intentionally isolated in
// src/ros/viewer3d.ts; treat ROS3D as `any` there. Pin versions in package.json
// (ros3d <-> three compatibility) — this is the known integration risk noted in
// the smabo-brain-ros README.
declare module 'ros3d';
