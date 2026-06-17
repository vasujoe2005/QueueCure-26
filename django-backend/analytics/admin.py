from django.contrib import admin

from .models import Analytics, ConsultationAnalytics, Patient, Visit


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('patientId', 'patientName', 'phone', 'email', 'age', 'gender', 'createdAt')
    search_fields = ('patientName', 'phone', 'email', 'patientId')


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ('displayToken', 'visitReason', 'status', 'trackingUrl', 'cancellationUrl', 'estimatedMinutes', 'createdAt', 'calledAt', 'completedAt', 'cancelledAt')
    list_filter = ('status', 'visitReason')
    search_fields = ('displayToken', 'visitReason')


@admin.register(ConsultationAnalytics)
class ConsultationAnalyticsAdmin(admin.ModelAdmin):
    list_display = ('visitReason', 'averageConsultationTime', 'totalVisits')


@admin.register(Analytics)
class AnalyticsAdmin(admin.ModelAdmin):
    list_display = ('date', 'totalPatients', 'avgWaitTime', 'avgConsultationTime')
