from djongo import models


class Patient(models.Model):
    patientName = models.CharField(max_length=100)
    tokenNumber = models.IntegerField()
    status = models.CharField(max_length=20, default='waiting')
    createdAt = models.DateTimeField()
    calledAt = models.DateTimeField(null=True, blank=True)
    completedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'patients'
        managed = False

    def __str__(self):
        return f'#{self.tokenNumber} {self.patientName}'


class Setting(models.Model):
    averageConsultationTime = models.FloatField(default=7)

    class Meta:
        db_table = 'settings'
        managed = False

    def __str__(self):
        return f'{self.averageConsultationTime} minutes'


class Analytics(models.Model):
    date = models.DateField()
    totalPatients = models.IntegerField(default=0)
    avgWaitTime = models.FloatField(default=0)
    avgConsultationTime = models.FloatField(default=0)

    class Meta:
        db_table = 'analytics'

    def __str__(self):
        return str(self.date)
