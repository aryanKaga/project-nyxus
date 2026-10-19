const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    requestWorkspaceIdAssignment,
    ASSIGN_EVENT
} = require('../../webviewprovider/assign_workspace_request');

test('requestWorkspaceIdAssignment rejects if socket is not connected', async () => {
    const socket = { connected: false };
    await assert.rejects(
        () => requestWorkspaceIdAssignment(socket, {
            userId: 'user-1',
            apiKey: 'key-1',
            workspaceName: 'proj'
        }),
        /socket is not connected/
    );
});

test('requestWorkspaceIdAssignment rejects if apiKey is missing', async () => {
    const socket = { connected: true };
    await assert.rejects(
        () => requestWorkspaceIdAssignment(socket, {
            userId: 'user-1',
            apiKey: '',
            workspaceName: 'proj'
        }),
        /API key is not configured/
    );
});

test('requestWorkspaceIdAssignment emits assign_workspace_id and resolves on valid acknowledgement', async () => {
    let emittedEvent = '';
    let emittedPayload = null;

    const mockSocket = {
        connected: true,
        emit(event, data, callback) {
            emittedEvent = event;
            emittedPayload = data;
            callback({ ok: true, workspace_id: 'server-assigned-uuid-42' });
        }
    };

    const result = await requestWorkspaceIdAssignment(mockSocket, {
        userId: 'test-user-id',
        apiKey: 'test-key',
        workspaceName: 'my-project'
    });

    assert.equal(emittedEvent, ASSIGN_EVENT);
    assert.deepEqual(emittedPayload, {
        user_id: 'test-user-id',
        apiKey: 'test-key',
        apikey: 'test-key',
        workspace_name: 'my-project'
    });
    assert.deepEqual(result, {
        ok: true,
        workspace_id: 'server-assigned-uuid-42'
    });
});

test('requestWorkspaceIdAssignment rejects when server returns ok: false', async () => {
    const mockSocket = {
        connected: true,
        emit(event, data, callback) {
            callback({ ok: false, error: 'Unauthorized user' });
        }
    };

    await assert.rejects(
        () => requestWorkspaceIdAssignment(mockSocket, {
            userId: 'bad-user',
            apiKey: 'test-key',
            workspaceName: 'my-project'
        }),
        /Unauthorized user/
    );
});

test('requestWorkspaceIdAssignment rejects when request times out', async () => {
    const mockSocket = {
        connected: true,
        emit(event, data, callback) {
            // Never invoke callback
        }
    };

    await assert.rejects(
        () => requestWorkspaceIdAssignment(
            mockSocket,
            { userId: 'u', apiKey: 'k', workspaceName: 'w' },
            50
        ),
        /timed out/
    );
});
