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
 *
 * The brain's web_offer reaches every open smabo-web (rosbridge broadcasts), so
 * each tab sends a random `peer` id with preview / answer / ICE, and only takes an
 * offer addressed to it (brain-ros stamps `peer`; the legacy brain sends offers
 * to one socket only, without `peer`) and only while its preview is on.
 */

type PublishFn = (topic: string, msg: Record<string, unknown>) => void;
type StreamCb  = (stream: MediaStream | null) => void;

let _pc: RTCPeerConnection | null = null;
let _publish: PublishFn | null = null;
let _onStream: StreamCb | null = null;
let _wanted = false;
const RETRY_MS = 1000;
const OFFER_TIMEOUT_MS = 10000;   // no offer by then → ask again (request lost, brain restarting)
let _offerTimer: ReturnType<typeof setTimeout> | null = null;
const PEER = `web-${Math.random().toString(36).slice(2, 10)}`;

export function init(publish: PublishFn, onStream: StreamCb) {
  _publish  = publish;
  _onStream = onStream;
}

/** Turn the brain→web video relay on or off. */
export function setPreview(on: boolean) {
  _wanted = on;
  _publish?.('/webrtc/preview', { data: JSON.stringify({ on, peer: PEER }) });
  _clearOfferTimer();
  if (on) {
    _offerTimer = setTimeout(() => {
      _offerTimer = null;
      if (_wanted) setPreview(true);
    }, OFFER_TIMEOUT_MS);
  } else {
    _close();
    _onStream?.(null);
  }
}

/** Brain offered the relayed camera track → answer it. */
export async function handleBrainOffer(dataJson: string) {
  const data = JSON.parse(dataJson) as RTCSessionDescriptionInit & { peer?: string };
  if (!_wanted || (data.peer !== undefined && data.peer !== PEER)) return;  // not ours
  _clearOfferTimer();
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
          peer: PEER,
        }),
      });
    }
  };

  const pc = _pc;
  pc.onconnectionstatechange = () => {
    if (pc !== _pc) return;   // superseded by a newer offer
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      _onStream?.(null);
      // The brain drops a preview whose connection failed; while ours is still
      // on, ask again (a new app stream is re-offered by the brain by itself).
      if (_wanted) setTimeout(() => {
        if (_wanted && pc === _pc) setPreview(true);
      }, RETRY_MS);
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription({ sdp: data.sdp, type: data.type }));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  if (pc !== _pc) return;

  _publish?.('/webrtc/web_answer', {
    data: JSON.stringify({ sdp: answer.sdp, type: answer.type, peer: PEER }),
  });
}

/** Called on brain disconnect: drop the peer (store resets previewOn). */
export function close() {
  _wanted = false;
  _clearOfferTimer();
  _close();
  _onStream?.(null);
}

function _clearOfferTimer() {
  if (_offerTimer !== null) clearTimeout(_offerTimer);
  _offerTimer = null;
}

function _close() {
  _pc?.close();
  _pc = null;
}
