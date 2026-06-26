/**
 * Browser-side WebRTC for receiving the camera **from smabo-brain** (preview).
 *
 * The phone (smabo-app) streams its camera to the brain; the brain runs vision
 * and — only while a web client turns preview ON — relays the same video on to
 * that web client. So the web is a pure viewer here: it never sources frames.
 *
 * Signaling (via the brain WebSocket):
 *   web → /webrtc/preview {on}   : ask brain to start / stop relaying
 *   brain → /webrtc/web_offer    : brain offers the relayed track (handleBrainOffer)
 *   web → /webrtc/web_answer     : our answer
 *   web → /webrtc/web_ice        : our ICE candidates
 *   (brain's ICE candidates are bundled in the offer SDP — aiortc is non-trickle)
 */

type PublishFn = (topic: string, msg: Record<string, unknown>) => void;
type StreamCb  = (stream: MediaStream | null) => void;

let _pc: RTCPeerConnection | null = null;
let _publish: PublishFn | null = null;
let _onStream: StreamCb | null = null;

export function init(publish: PublishFn, onStream: StreamCb) {
  _publish  = publish;
  _onStream = onStream;
}

/** Turn the brain→web video relay on or off. */
export function setPreview(on: boolean) {
  _publish?.('/webrtc/preview', { data: JSON.stringify({ on }) });
  if (!on) {
    _close();
    _onStream?.(null);
  }
}

/** Brain offered the relayed camera track → answer it. */
export async function handleBrainOffer(dataJson: string) {
  _close();

  _pc = new RTCPeerConnection({ iceServers: [] });

  _pc.ontrack = (ev) => {
    _onStream?.(ev.streams[0] ?? null);
  };

  _pc.onicecandidate = (ev) => {
    if (ev.candidate && _publish) {
      _publish('/webrtc/web_ice', {
        data: JSON.stringify({
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        }),
      });
    }
  };

  _pc.onconnectionstatechange = () => {
    if (_pc?.connectionState === 'failed' || _pc?.connectionState === 'closed') {
      _onStream?.(null);
    }
  };

  const data = JSON.parse(dataJson) as RTCSessionDescriptionInit;
  await _pc.setRemoteDescription(new RTCSessionDescription(data));
  const answer = await _pc.createAnswer();
  await _pc.setLocalDescription(answer);

  _publish?.('/webrtc/web_answer', {
    data: JSON.stringify({ sdp: answer.sdp, type: answer.type }),
  });
}

/** Called on brain disconnect: drop the peer (store resets previewOn). */
export function close() {
  _close();
  _onStream?.(null);
}

function _close() {
  _pc?.close();
  _pc = null;
}
