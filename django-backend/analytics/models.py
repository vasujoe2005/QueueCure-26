from djongo import models


class Patient(models.Model):
    patientId = models.CharField(max_length=80)
    patientName = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    email = models.CharField(max_length=120)
    age = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    createdAt = models.DateTimeField()

    class Meta:
        db_table = 'patients'
        managed = False

    def __str__(self):
        return self.patientName


class Visit(models.Model):
    patientId = models.ForeignKey(Patient, db_column='patientId', on_delete=models.DO_NOTHING)
    tokenNumber = models.IntegerField()
    displayToken = models.CharField(max_length=20)
    visitReason = models.CharField(max_length=80)
    priority = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='waiting')
    trackingUrl = models.CharField(max_length=240, blank=True)
    cancellationUrl = models.CharField(max_length=240, blank=True)
    estimatedMinutes = models.FloatField(default=8)
    createdAt = models.DateTimeField()
    calledAt = models.DateTimeField(null=True, blank=True)
    completedAt = models.DateTimeField(null=True, blank=True)
    cancelledAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'visits'
        managed = False

    def __str__(self):
        return f'#{self.displayToken} {self.visitReason}'


class ConsultationAnalytics(models.Model):
    visitReason = models.CharField(max_length=80)
    averageConsultationTime = models.FloatField(default=8)
    totalVisits = models.IntegerField(default=0)

    class Meta:
        db_table = 'consultation_analytics'
        managed = False

    def __str__(self):
        return self.visitReason


class Analytics(models.Model):
    date = models.DateField()
    totalPatients = models.IntegerField(default=0)
    avgWaitTime = models.FloatField(default=0)
    avgConsultationTime = models.FloatField(default=0)

    class Meta:
        db_table = 'analytics'

    def __str__(self):
        return str(self.date)
