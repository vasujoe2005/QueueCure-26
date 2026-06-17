from datetime import timedelta

from django.http import JsonResponse

from .models import Patient, Setting


def minutes_between(start, end):
    if not start or not end:
      return None

    delta = end - start
    if not isinstance(delta, timedelta):
      return None

    return max(delta.total_seconds() / 60, 0)


def average(values):
    clean_values = [value for value in values if value is not None]
    if not clean_values:
        return 0
    return round(sum(clean_values) / len(clean_values), 1)


def wait_time(request):
    patients = Patient.objects.all()
    wait_times = [minutes_between(patient.createdAt, patient.calledAt) for patient in patients]
    consultation_times = [
        minutes_between(patient.calledAt, patient.completedAt)
        for patient in patients
        if patient.status == 'completed'
    ]

    setting = Setting.objects.first()
    fallback_consultation = setting.averageConsultationTime if setting else 7
    avg_consultation = average(consultation_times) or fallback_consultation

    return JsonResponse({
        'averageConsultationTime': avg_consultation,
        'averageWaitTime': average(wait_times),
        'totalPatients': patients.count(),
    })
