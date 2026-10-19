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
