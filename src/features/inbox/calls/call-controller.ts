import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc';

import { errorMessage as apiErrorMessage } from '@/lib/api';

import { acceptCall, callCustomerName, type CallSession, type CallStatus, createCall, endCall, rejectCall } from './calls-api';

/**
 * In-app WhatsApp voice calls over WebRTC. A port of gennit-app's
 * lib/whatsapp-call-controller.ts: the server relays SDP offers and answers
 * to WhatsApp, and the live-calls poll drives state changes.
 */

export type CallPhase = 'idle' | 'connecting' | 'ringing' | 'incoming' | 'answering' | 'active' | 'ended';

export type CallState = {
  phase: CallPhase;
  call?: CallSession;
  customerName?: string;
  muted: boolean;
  connectedAt?: number;
  endedStatus?: CallStatus;
  error?: string;
};

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const TERMINAL = new Set<CallStatus>(['declined', 'missed', 'ended', 'failed']);

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError') {
    return 'Microphone access is off. Turn it on for Genit in Settings to call.';
  }
  return apiErrorMessage(error) || 'The call could not be completed.';
}

function waitFor(pc: RTCPeerConnection, event: 'icegatheringstatechange' | 'connectionstatechange', done: () => boolean, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    if (done()) return resolve();
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener(event, check);
      resolve();
    };
    const check = () => done() && finish();
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener(event, check);
  });
}

class CallController {
  private state: CallState = { phase: 'idle', muted: false };
  private listeners = new Set<() => void>();
  private pc?: RTCPeerConnection;
  private stream?: MediaStream;
  private applyingAnswer = false;
  private attempt = 0;
  private resetTimer?: ReturnType<typeof setTimeout>;
  private dismissed = new Set<string>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  get busy() {
    return !['idle', 'ended'].includes(this.state.phase);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private async openPeer() {
    // Loaded on demand: the native module only exists in development and store builds.
    const { mediaDevices, RTCPeerConnection: PeerConnection } = await import('react-native-webrtc');
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    const pc = new PeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    // Remote audio plays through the call audio session automatically on native.
    pc.addEventListener('connectionstatechange', () => {
      if (pc === this.pc && pc.connectionState === 'failed') void this.fail('The audio connection dropped.');
    });
    this.pc = pc;
    this.stream = stream;
    return pc;
  }

  private setMicrophone(enabled: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private teardown() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    this.pc = undefined;
    this.stream = undefined;
    this.applyingAnswer = false;
  }

  private finish(status: CallStatus, error?: string) {
    this.teardown();
    this.set({ phase: 'ended', endedStatus: status, error });
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      if (this.state.phase === 'ended') this.set({ phase: 'idle', call: undefined, error: undefined });
    }, 3000);
  }

  private async fail(message: string) {
    const call = this.state.call;
    this.finish('failed', message);
    if (call) await endCall(call._id).catch(() => undefined);
  }

  async startOutbound(conversationId: string, customerName: string) {
    if (this.busy) throw new Error('Finish the current call first.');
    const attempt = ++this.attempt;
    clearTimeout(this.resetTimer);
    this.set({ phase: 'connecting', call: undefined, customerName, muted: false, connectedAt: undefined, endedStatus: undefined, error: undefined });
    try {
      const pc = await this.openPeer();
      await pc.setLocalDescription(await pc.createOffer({}));
      await waitFor(pc, 'icegatheringstatechange', () => pc.iceGatheringState === 'complete', 4000);
      const call = await createCall(conversationId, { mode: 'whatsapp_native', callType: 'audio', sdp: pc.localDescription!.sdp });
      if (attempt !== this.attempt) {
        await endCall(call._id).catch(() => undefined);
        return call;
      }
      this.set({ phase: 'ringing', call });
      await this.sync(call);
      return call;
    } catch (error) {
      if (attempt === this.attempt) {
        this.teardown();
        this.set({ phase: 'idle', error: errorMessage(error) });
      }
      throw new Error(errorMessage(error));
    }
  }

  ring(call: CallSession) {
    if (this.busy || this.dismissed.has(call._id) || !call.metadata?.offerSdp) return;
    clearTimeout(this.resetTimer);
    this.set({
      phase: 'incoming',
      call,
      customerName: callCustomerName(call) || 'WhatsApp caller',
      muted: false,
      connectedAt: undefined,
      endedStatus: undefined,
      error: undefined,
    });
  }

  async answer() {
    const call = this.state.call;
    const offer = call?.metadata?.offerSdp;
    if (this.state.phase !== 'incoming' || !call || !offer) return;
    const attempt = ++this.attempt;
    this.set({ phase: 'answering' });
    try {
      const pc = await this.openPeer();
      // Keep the mic closed until WhatsApp confirms the answer.
      this.setMicrophone(false);
      await pc.setRemoteDescription({ type: 'offer', sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitFor(pc, 'icegatheringstatechange', () => pc.iceGatheringState === 'complete', 4000);
      await acceptCall(call._id, { stage: 'pre_accept', sdp: pc.localDescription!.sdp });
      await waitFor(pc, 'connectionstatechange', () => ['connected', 'failed', 'closed'].includes(pc.connectionState), 8000);
      const accepted = await acceptCall(call._id, { stage: 'accept' });
      if (attempt !== this.attempt) return;
      this.setMicrophone(!this.state.muted);
      this.set({ phase: 'active', call: accepted, connectedAt: Date.now() });
    } catch (error) {
      this.dismissed.add(call._id);
      if (attempt === this.attempt) {
        this.teardown();
        this.set({ phase: 'idle', call: undefined, error: errorMessage(error) });
      }
      throw new Error(errorMessage(error));
    }
  }

  dropIncoming(callId: string) {
    if (this.state.phase === 'incoming' && this.state.call?._id === callId) this.set({ phase: 'idle', call: undefined });
  }

  async decline() {
    const call = this.state.call;
    if (this.state.phase !== 'incoming' || !call) return;
    this.dismissed.add(call._id);
    this.set({ phase: 'idle', call: undefined });
    await rejectCall(call._id).catch(() => undefined);
  }

  async hangup() {
    const call = this.state.call;
    this.attempt++;
    this.finish('ended');
    if (call) await endCall(call._id).catch(() => undefined);
  }

  toggleMute() {
    const muted = !this.state.muted;
    if (this.state.phase === 'active' || this.state.phase === 'ringing') this.setMicrophone(!muted);
    this.set({ muted });
  }

  /** Applies the latest server state for the current call. */
  async sync(call: CallSession) {
    const current = this.state.call;
    if (!current || current._id !== call._id) return;

    if (this.state.phase === 'incoming') {
      if (call.status !== 'ringing' || call.metadata?.claimedBy) this.set({ phase: 'idle', call: undefined });
      return;
    }

    const answer = call.metadata?.remoteAnswerSdp;
    const pc = this.pc;
    if (pc && call.direction === 'outbound' && answer && !pc.remoteDescription && !this.applyingAnswer) {
      this.applyingAnswer = true;
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      } catch {
        return this.fail('WhatsApp returned an audio answer we could not use.');
      }
    }

    if (TERMINAL.has(call.status)) {
      if (this.state.phase !== 'ended') this.finish(call.status, call.error);
      return;
    }
    if (call.status === 'answered' && this.state.phase === 'ringing') this.set({ phase: 'active', call, connectedAt: Date.now() });
  }
}

export const callController = new CallController();
