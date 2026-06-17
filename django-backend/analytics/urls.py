from django.urls import path

from .views import most_common_visits, wait_time

urlpatterns = [
    path('wait-time/', wait_time, name='wait-time'),
    path('most-common-visits/', most_common_visits, name='most-common-visits'),
]
