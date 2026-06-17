from django.urls import path

from .views import wait_time

urlpatterns = [
    path('wait-time/', wait_time, name='wait-time'),
]
