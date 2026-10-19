const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    requestWorkspaceIdAssignment,
    ASSIGN_EVENT
} = require('../../webviewprovider/assign_workspace_request');

// When passed a socket-like object (has .emit), uses Socket.IO path
test('requestWorkspaceIdAssignment rejects if socket is not connected', async () => {
    const socket = { connected: false, emit() {} };
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
    const socket = { connected: true, emit() {} };
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
        apiKey: 'test-key',
        apikey: 'test-key',
        user_id: 'test-user-id',
        userId: 'test-user-id',
        workspace_name: 'my-project',
        custom_name: 'my-project',
        description: ''
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

test('requestWorkspaceIdAssignment handles customName, description, and workspaceId', async () => {
    let capturedData = null;
    const mockSocket = {
        connected: true,
        emit(event, data, callback) {
            capturedData = data;
            callback({ ok: true, workspace_id: 'ws-assigned-99' });
        }
    };

    const res = await requestWorkspaceIdAssignment(mockSocket, {
        apiKey: 'secret-key',
        customName: 'Custom Service',
        description: 'Microservice description',
        workspaceId: 'existing-static-id'
    });

    assert.equal(res.ok, true);
    assert.equal(res.workspace_id, 'ws-assigned-99');
    assert.deepEqual(capturedData, {
        apiKey: 'secret-key',
        apikey: 'secret-key',
        user_id: '123',
        userId: '123',
        workspace_name: 'Custom Service',
        custom_name: 'Custom Service',
        description: 'Microservice description',
        workspace_id: 'existing-static-id'
    });
});

test('deleteWorkspaceHttp rejects if workspaceId is missing', async () => {
    const { deleteWorkspaceHttp } = require('../../webviewprovider/assign_workspace_request');
    await assert.rejects(
        () => deleteWorkspaceHttp('http://localhost:3000', {
            userId: '123',
            apiKey: 'key',
            workspaceId: ''
        }),
        /No workspace ID to delete/
    );
});

