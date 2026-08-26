from mcp_server.tools.getfile import get_file_content


def test_get_file_content():
    # Replace these with actual values for testing
    test_file_path = "path/to/test/file.txt"
    test_user_sid = "test_user_sid"

    # Call the get_file_content function
    file_content = get_file_content(test_file_path, test_user_sid)

    # Print the result
    print("File Content:", file_content)