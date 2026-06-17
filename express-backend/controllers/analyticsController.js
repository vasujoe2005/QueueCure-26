async function getWaitTime(req, res, next) {
  try {
    const baseUrl = process.env.DJANGO_ANALYTICS_URL || 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/analytics/wait-time/`);

    if (!response.ok) {
      return res.status(response.status).json({ message: 'Django analytics service unavailable' });
    }

    return res.json(await response.json());
  } catch (error) {
    return next(error);
  }
}

module.exports = { getWaitTime };
