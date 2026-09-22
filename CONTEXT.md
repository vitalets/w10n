# WebExtension Modules

The project provides source modules for recurring concepts in WebExtension applications.

## Language

**Context-menu item**:
A stable-ID command contributed by an extension to a browser context menu.
_Avoid_: Context menu

**Storage item**:
A value and its associated key managed as one unit in a WebExtension storage area.
_Avoid_: Storage manager, key storage

**Internal message**:
A one-shot communication between contexts belonging to the same WebExtension, addressed either to extension contexts or to a content script in a specific tab and optional frame.
_Avoid_: External message, port message

**Message**:
An internal message sent without expecting a response.
_Avoid_: Notification, event

**Request**:
An internal message whose sender expects one response from its handler.
_Avoid_: RPC call
