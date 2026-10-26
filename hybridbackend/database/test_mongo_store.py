from unittest.mock import patch

from database.mongo_store import MongoStore


def test_separate_credentials_allow_reserved_chars_in_atlas_credentials():
    with (
        patch("database.mongo_store.MongoClient") as client_factory,
        patch("database.mongo_store.GridFSBucket"),
    ):
        client_factory.return_value.__getitem__.return_value.__getitem__.return_value = (
            type("FakeCollection", (), {"create_index": lambda *args, **kwargs: None})()
        )
        store = MongoStore(
            uri="mongodb://not-a-real-user:p@ss@localhost:27017/test",
            username="atlas-user",
            password="p@ss:word",
            database="test",
        )

    client_factory.return_value.__getitem__.assert_called_once_with("test")
    assert client_factory.call_args.args[0] == "mongodb://localhost:27017/test"
    assert client_factory.call_args.kwargs["username"] == "atlas-user"
    assert client_factory.call_args.kwargs["password"] == "p@ss:word"


def test_save_and_get_observation():
    with (
        patch("database.mongo_store.MongoClient") as client_factory,
        patch("database.mongo_store.GridFSBucket"),
    ):
        inserted = []
        mock_cursor = type("FakeCursor", (), {
            "sort": lambda self, order: [{"step": 1, "observation": "test_obs"}]
        })()
        fake_coll = type("FakeCollection", (), {
            "insert_one": lambda self, doc: type("InsertResult", (), {"inserted_id": "test-id-123"})(),
            "find": lambda self, query, proj: mock_cursor,
        })()
        client_factory.return_value.__getitem__.return_value.__getitem__.return_value = fake_coll
        store = MongoStore(uri="mongodb://localhost:27017/test", database="test")
        store.ping = lambda: None

        doc = store.save_observation(
            api_key="key123",
            workspace_id="ws-456",
            observation={"step": 1, "node": "tools", "action": "tool_call:search", "output": "results"},
            task_id="task-1",
            thread_id="thread-1",
        )

        assert doc["workspace_id"] == "ws-456"
        assert doc["task_id"] == "task-1"
        assert doc["thread_id"] == "thread-1"
        assert doc["step"] == 1
        assert doc["node"] == "tools"
        assert doc["action"] == "tool_call:search"
        assert doc["_id"] == "test-id-123"

        obs_list = store.get_observations(api_key="key123", workspace_id="ws-456")
        assert len(obs_list) == 1
        assert obs_list[0]["step"] == 1

