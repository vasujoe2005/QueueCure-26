from datetime import timedelta

from django.db.models import Count
from django.http import JsonResponse

from .models import ConsultationAnalytics, Visit


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
    visits = Visit.objects.all()
    wait_times = [minutes_between(visit.createdAt, visit.calledAt) for visit in visits]
    consultation_times = [
        minutes_between(visit.calledAt, visit.completedAt)
        for visit in visits
        if visit.status == 'completed'
    ]

    reason_stats = list(
        ConsultationAnalytics.objects.all()
        .order_by('-totalVisits')
        .values('visitReason', 'averageConsultationTime', 'totalVisits')
    )

    return JsonResponse({
        'averageConsultationTime': average(consultation_times),
        'averageWaitTime': average(wait_times),
        'totalPatients': visits.count(),
        'reasonStats': reason_stats,
    })


def most_common_visits(request):
    visits_by_reason = (
        Visit.objects.values('visitReason')
        .annotate(total=Count('id'))
        .order_by('-total')
    )
    total_visits = Visit.objects.count() or 1

    return JsonResponse({
        'items': [
            {
                'reason': item['visitReason'],
                'total': item['total'],
                'percentage': round((item['total'] / total_visits) * 100, 1),
            }
            for item in visits_by_reason
        ]
    })
