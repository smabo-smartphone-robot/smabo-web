// Thin, isolated wrapper around ros3djs. All `any` lives here because ros3d has
// no TypeScript types (see ros3d.d.ts). ros3d (a UMD-era lib) expects THREE and
// ROSLIB as globals, so we set them and then dynamically import ros3d — dynamic
// import lets the globals be in place before ros3d's module body runs.
//
// Robustness: each layer is wrapped in try/catch so a missing piece (e.g. no
// tf2_web_republisher for TF) degrades gracefully instead of blanking the view.
import * as ROSLIB from 'roslib';

export interface Viewer3DOptions {
  div: HTMLElement;
  ros: ROSLIB.Ros;
  fixedFrame: string;       // 'map' for Nav, 'base_link' for the arm
  showMap?: boolean;        // OccupancyGridClient(/map)
  showScan?: boolean;       // LaserScan(/scan)
  showUrdf?: boolean;       // UrdfClient(/robot_description)
  background?: string;
}

export interface Viewer3DHandle {
  tfClient: any;
  scene: any;
  dispose(): void;
}

export async function createViewer3D(opts: Viewer3DOptions): Promise<Viewer3DHandle> {
  const THREE = await import('three');
  (window as any).THREE = THREE;
  (window as any).ROSLIB = ROSLIB;
  const ROS3D: any = await import('ros3d');

  const { div, ros, fixedFrame } = opts;
  const width = div.clientWidth || 640;
  const height = div.clientHeight || 480;

  const viewer = new ROS3D.Viewer({
    divID: div.id,
    width,
    height,
    antialias: true,
    background: opts.background ?? '#16213e',
    cameraPose: { x: 1.5, y: 1.5, z: 1.5 },
  });

  viewer.addObject(new ROS3D.Grid({ num_cells: 20, cellSize: 0.25, color: '#1e3a5f' }));

  // TF (needs tf2_web_republisher running on the ROS side).
  const tfClient = new ROSLIB.TFClient({
    ros,
    fixedFrame,
    angularThres: 0.01,
    transThres: 0.01,
    rate: 10.0,
  });

  if (opts.showUrdf) {
    try {
      // eslint-disable-next-line no-new
      new ROS3D.UrdfClient({
        ros,
        tfClient,
        rootObject: viewer.scene,
        param: 'robot_description',
        // primitive-only URDF → no mesh loader/path required
      });
    } catch (e) { console.warn('UrdfClient failed', e); }
  }

  if (opts.showMap) {
    try {
      // eslint-disable-next-line no-new
      new ROS3D.OccupancyGridClient({
        ros,
        rootObject: viewer.scene,
        topic: '/map',
        continuous: true,
      });
    } catch (e) { console.warn('OccupancyGridClient failed', e); }
  }

  if (opts.showScan) {
    try {
      // eslint-disable-next-line no-new
      new ROS3D.LaserScan({
        ros,
        tfClient,
        topic: '/scan',
        rootObject: viewer.scene,
        material: { size: 0.03, color: 0xff4560 },
      });
    } catch (e) { console.warn('LaserScan failed', e); }
  }

  return {
    tfClient,
    scene: viewer.scene,
    dispose() {
      try { tfClient.dispose?.(); } catch { /* ignore */ }
      try { viewer.stop?.(); } catch { /* ignore */ }
      // remove the canvas ros3d injected
      while (div.firstChild) div.removeChild(div.firstChild);
    },
  };
}
