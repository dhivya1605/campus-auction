import React, { useState, useEffect } from 'react';

export const CountdownTimer = ({ closingTime, onEnd }) => {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(closingTime));

  function calculateTimeLeft(target) {
    const difference = new Date(target).getTime() - new Date().getTime();
    if (difference <= 0) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
    }

    return {
      total: difference,
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      ended: false
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft(closingTime);
      setTimeLeft(remaining);
      if (remaining.ended) {
        clearInterval(timer);
        if (onEnd) onEnd();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [closingTime, onEnd]);

  if (timeLeft.ended) {
    return <span className="countdown-pill countdown-ended">Ended</span>;
  }

  const isUrgent = timeLeft.total < 3600 * 1000; // Less than 1 hour

  const formatText = () => {
    if (timeLeft.days > 0) {
      return `${timeLeft.days}d ${timeLeft.hours}h left`;
    }
    if (timeLeft.hours > 0) {
      return `${timeLeft.hours}h ${timeLeft.minutes}m left`;
    }
    return `${timeLeft.minutes}m ${timeLeft.seconds}s left`;
  };

  return (
    <span className={`countdown-pill ${isUrgent ? 'countdown-urgent' : ''}`}>
      ⏱ {formatText()}
    </span>
  );
};

export default CountdownTimer;

