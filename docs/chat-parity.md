# Chat `[id]` parity: web (`gennit-app`) → mobile (`gennit-mobile`)

Source of truth on web: `app/(workspace)/chat/[id]/page.tsx` → `components/layout/chat-layout.tsx`
→ `components/chat/**`, `context/DesignProject.tsx`, `hooks/use-agent-runs.ts`, `components/automation.tsx`.
Mobile: `src/app/(app)/chat/[id].tsx`, `src/features/chat/**`.

Legend: [x] on mobile · [~] partial (reason given) · [-] deferred / not applicable (reason given)

## Loading and history
- [x] Load project `GET project/:id`; error state with Retry
- [x] Agent run history `GET agents/project/:projectId`
- [x] Merge runs and saved messages by time; hide duplicates of run prompts/texts and "Here is the generated design/video" notices
- [x] Empty state "Start a conversation"
- [x] Stick to bottom while streaming; "scroll to latest" button

## Realtime (socket.io, `joinProject` / `leaveProject`, re-join on reconnect)
- [x] `agent:run:start|resume|end`, `agent:plan`, `agent:task:update`, `agent:thinking:delta|end`, `agent:tool:call|result`, `agent:elicit`, `agent:integration_required`, `agent:text:delta`
- [x] Legacy pipeline: `newMessage`, `textStart`, `textDelta`, `textCompleted`, `generatingimage`, `generatingimage:stop`, `workflow:ai:status`
- [x] `workflow:node:new` (live design nodes) → feeds the Design studio preview
- [x] `automation:graph:update`, `automation:ai:update`, `agent:run:end` → live automation graph refresh
- [-] `brand-identity-updated`: only drives the web's brand-save spinner after editing brand inside chat; mobile edits brand on the Brand screen

## Composer (`POST agents/upload`, `POST agents/run`, `POST agents/:runId/stop|continue`)
- [x] Multiline input, send, stop running agent
- [x] "continue / resume / go on / keep going" resumes the last cancelled/failed/running run
- [x] Attachments: images, videos, PDF, DOCX/XLSX/PPTX, 4 files, 10 MB each, uploaded before the run
- [x] Paste an image from the clipboard (web: paste into textarea)
- [x] Selected design inspiration goes with each message while selected (web `selectedFiles[0]`), shown as a removable chip; removing it saves `PATCH project/:id/inspiration {inspirationUrl:null}`
- [x] Validation (2–5000 chars or a file), client time context appended
- [x] Agent model picker `GET inspire/models?type=general`, `POST inspire/models/:id/use`
- [x] Brand identity drawer: apply toggle, brand colors, edit/add brand
- [x] Credits left; out-of-credits block
- [x] Prompt enhancer `POST project/enhance-prompt` (mobile extra)
- [-] Upgrade / Buy credits buttons: App Store rule 3.1.1 forbids linking to outside purchase; mobile tells the user where to top up
- [-] Speech-to-text mic: iOS/Android keyboards have built-in dictation in the same text field; a custom recognizer needs a new native module and a dev-client rebuild
- [-] "AI cost mode" (economy/balanced/quality): web-only localStorage setting; the server ignores `costMode`
- [-] Drag and drop, Enter-to-send, resizable split, fullscreen preview toggle: desktop-only interactions

## Agent run rendering
- [x] User bubble with attachments (tap to view)
- [x] Status badges: working, waiting on you, connect account, needs attention
- [x] Thinking stream, plan with task status
- [x] Tool calls with pending labels and result links
- [x] Every result card the server renders: generated_design, document_artifact, document_list, research_report, design_inspiration (merged picker), browser_session, automation_* (summary), calendar_events / calendar_event_created, web_search_results, video/youtube_transcript, gtm_* (campaign, list, leads, outbound, optimizer, attribution, pdf report), email/contacts/drive/forms/posts/comments/insights/campaigns
- [x] Capability error cards (provider_* , request_invalid, resource_not_found, verification_failed, execution_incomplete) with Contact support
- [x] Elicitation: buttons, image/video size, video duration, plugin choice, multi-select, Other + attachments `POST agents/:runId/resume {kind:'user_input'}`
- [x] Integration required: connect in place, then `resume {kind:'integration_connected'}`
- [x] Inline "connect plugin" links inside markdown
- [x] Copy, like/dislike, delete run `DELETE agents/:runId`

## Saved (legacy pipeline) messages
- [x] Markdown text, reasoning block
- [x] Like/dislike `POST|DELETE project/:id/messages/:mid/reactions[/:type]`, copy, delete `DELETE project/:id/messages`
- [x] Option chips → `POST project/generate/:id` (same contract as web `generateMessage`)
- [x] "Select project type" radio (locked once the project has a category)
- [x] `search_results` part → inspiration picker, `PATCH project/:id/inspiration`
- [x] "Connect / Reconnect <plugin>" button detected from the reply text → Plugins
- [x] "Top up Meta / Google Ads balance" links
- [x] "Processed in" time
- [-] Edit a user message: web calls `PUT project/:id/messages/:mid`, which the server does not have (404 on web too). Hidden on mobile until the server adds the route.

## Design versions (generation groups)
- [x] Versions carousel, generating / error states, view full size
- [x] Use this version `POST project/:id/set-active-generation`
- [x] Edit area (inpaint) `POST project/:id/inpaint` with a drawn mask
- [x] Publish / unpublish to inspiration `POST templates/publish|unpublish`
- [x] Save/share, delete version `DELETE project/:id/generation-item`
- [x] Convert to video (animate): web sends the image to its video creator; mobile asks the agent in this chat with the image attached (same `agents/run` contract)
- [x] Workflow / automation snapshot items → "View canvas"
- [-] Remotion `videoConfig` previews: need the Remotion web player; mobile shows the item with an "open on web" note

## Preview panel
- [x] Opened from the header (latest result, plus a Design studio button), as the web's phone layout does; the desktop split view's auto-open is desktop-only
- [x] Documents and research reports (WebView), open externally, save/share
- [x] Live browser: server page in standalone mode (back/forward, URL, tabs, take control, devtools, verification hand-off), viewport sized to the phone `POST agents/browser/viewport`
- [x] Media viewer: pinch-zoom image, native video player, save/share
- [x] Design studio (web graphics canvas): every design in the chat plus live nodes, tap to open
- [x] Working indicator while the agent runs (web thinking overlay)
- [x] Automation graph (`GET apps/automation/:id?layout=1`): ordered steps with branches, validation issues per step, ready badge, live updates
- [x] Automation: activate/pause, edit a step's fields, delete a step, zero-credit dry run from any step `POST apps/automation/:id/test-run`, save with `baseRevision` and 409 retry `PUT apps/automation/:id`
- [x] Automation: "Ask Genit to add a step" (prefills the composer)
- [~] Automation: adding steps by hand from the 1,000+ app catalog, drag to connect, undo/redo — the canvas editor's per-node forms are not ported; adding/connecting is done through the agent
- [-] Live browser device/orientation emulation: the phone is the device
- [~] Legacy "workflow" category canvas (`apps/workflow/:slug`): not ported; old design-workflow projects open as chat only

## Header / chat options
- [x] New chat, all chats, archive `PATCH project/:id/archive`, delete `DELETE project/:id`

## Verification (2026-11-21)
- `npx tsc --noEmit` and `npx expo lint` on the chat/automation code: clean. The mobile repo has no unit-test suite.
- Simulator (iPhone 17 Pro Max, debug build, Metro on :8082) against an in-memory mock of the chat, agent, automation and socket.io endpoints (scratch script outside the repo; no production traffic). Exercised and working:
  legacy option chip → `project/generate` → streamed reply; project-type lock; connect and top-up buttons; processed time;
  inspiration auto-select → composer chip → attached to the run → removed;
  agent run streaming (thinking, plan, tool call, result, text); elicitation → answer → resume → completion;
  Design studio gallery and full-size viewer; latest-result preview;
  automation graph with branches and issues; failed and passed dry runs; edit + save (auto-saved before a dry run); pause toggle; "Ask Genit to add a step" prefill;
  Convert to video (run with the version attached and the web's prompt); unpublish; paste-image with an empty clipboard.
- Bug found and fixed while testing: the preview sheet renders in a portal, so cards inside it lost the chat context (crash opening the Design studio). The drawer now re-provides it.
- Not verified: real server responses and real generation (needs credentials and credits); pasting an actual image (would overwrite the Mac clipboard); the 409 retry path of graph saves (same logic as before, moved into `updateAutomationGraph`); live `workflow:node:new` tiles (the mock sends them, but they were not caught on screen before the saved result replaced them); Android.

## Server follow-up
- `PUT project/:projectId/messages/:messageId` (edit a saved message) does not exist; web edit returns 404. Mobile hides edit. Adding the route is a server change, not made here.
