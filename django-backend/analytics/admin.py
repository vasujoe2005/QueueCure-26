from django.contrib import admin

from .models import Analytics, Patient, Setting


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('tokenNumber', 'patientName', 'status', 'createdAt', 'calledAt', 'completedAt')
    list_filter = ('status',)
    search_fields = ('patientName', 'tokenNumber')


@admin.register(Setting)
class SettingAdmin(admin.ModelAdmin):
    list_display = ('averageConsultationTime',)


@admin.register(Analytics)
class AnalyticsAdmin(admin.ModelAdmin):
    list_display = ('date', 'totalPatients', 'avgWaitTime', 'avgConsultationTime')
