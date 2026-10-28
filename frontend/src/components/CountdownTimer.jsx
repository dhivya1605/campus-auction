import React, { useState, useEffect, useRef } from 'react';

export const CountdownTimer = ({ closingTime, onEnd }) => {
  const calculateTimeLeft = (target) => {
    if (!target) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
    }
    const difference = new Date(target).getTime() - new Date().getTime();
    if (isNaN(difference) || difference <= 0) {
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
  };

  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(closingTime));
  
  // Guard against calling onEnd multiple times or when already ended on mount
  const hasNotifiedRef = useRef(calculateTimeLeft(closingTime).ended);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    const initialRemaining = calculateTimeLeft(closingTime);
    setTimeLeft(initialRemaining);

    // If auction has already ended when mounted or when closingTime is in the past,
    // do not schedule an interval and do not trigger onEnd again.
    if (initialRemaining.ended) {
      hasNotifiedRef.current = true;
      return;
    }

    // Reset notification flag when a new future closingTime is provided (e.g. anti-sniping extension)
    hasNotifiedRef.current = false;

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft(closingTime);
      setTimeLeft(remaining);

      if (remaining.ended) {
        clearInterval(timer);
        if (!hasNotifiedRef.current) {
          hasNotifiedRef.current = true;
          if (onEndRef.current) {
            onEndRef.current();
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [closingTime]);

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

