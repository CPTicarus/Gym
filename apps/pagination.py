"""Pagination for the libraries the frontend loads whole.

The moves and foods libraries are small (hundreds of rows at most), and
every screen that uses them — the library pages, the plan builders'
pickers — filters them in the browser for instant search. Walking them 20
rows a request at a time just to reassemble the whole list was slow, and
a page that forgot to walk them showed only the first 20.
"""
from rest_framework.pagination import PageNumberPagination


class LibraryPagination(PageNumberPagination):
    """The usual 20 per page, unless the client asks for more with
    ?page_size= (up to 1000), which is how it gets a whole library in one
    request."""

    page_size_query_param = "page_size"
    max_page_size = 1000
