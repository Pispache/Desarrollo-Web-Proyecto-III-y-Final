using System;
using System.Data;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace Api.Logging
{
    public sealed class SqlLoggerProvider : ILoggerProvider
    {
        private readonly Func<string> _getConnectionString;
        private readonly Channel<LogEntry> _channel;
        private readonly CancellationTokenSource _cts = new();
        private readonly Task _consumer;

        public SqlLoggerProvider(Func<string> getConnectionString)
        {
            _getConnectionString = getConnectionString ?? throw new ArgumentNullException(nameof(getConnectionString));
            _channel = Channel.CreateBounded<LogEntry>(new BoundedChannelOptions(1000)
            {
                FullMode = BoundedChannelFullMode.DropOldest
            });
            _consumer = Task.Run(ConsumeAsync);
        }

        public ILogger CreateLogger(string categoryName) => new SqlLogger(_channel.Writer, categoryName);

        public void Dispose()
        {
            _cts.Cancel();
            _channel.Writer.TryComplete();
            try { _consumer.Wait(TimeSpan.FromSeconds(2)); } catch { /* ignore */ }
            _cts.Dispose();
        }

        private async Task ConsumeAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    while (await _channel.Reader.WaitToReadAsync(_cts.Token))
                    {
                        while (_channel.Reader.TryRead(out var entry))
                        {
                            await WriteAsync(entry);
                        }
                    }
                }
                catch (OperationCanceledException) { break; }
                catch
                {
                    await Task.Delay(500, _cts.Token);
                }
            }
        }

        private async Task WriteAsync(LogEntry e)
        {
            try
            {
                await using var c = new SqlConnection(_getConnectionString());
                await c.OpenAsync(_cts.Token);
                await c.ExecuteAsync(@"INSERT INTO MarcadorDB.dbo.Logs([Level],[Category],[Message],[Exception],[Properties])
VALUES(@Level, @Category, @Message, @Exception, @Properties);",
                    new
                    {
                        Level = e.Level,
                        Category = e.Category,
                        Message = e.Message,
                        Exception = e.Exception,
                        Properties = e.State
                    });
            }
            catch
            {
                // Swallow logging errors to avoid crashing the app due to logging failures.
            }
        }

        private sealed class SqlLogger : ILogger
        {
            private readonly ChannelWriter<LogEntry> _writer;
            private readonly string _category;

            public SqlLogger(ChannelWriter<LogEntry> writer, string category)
            {
                _writer = writer;
                _category = category;
            }

            IDisposable ILogger.BeginScope<TState>(TState state) => NullScope.Instance;
            public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (!IsEnabled(logLevel)) return;
                var msg = formatter?.Invoke(state, exception) ?? state?.ToString() ?? string.Empty;
                var entry = new LogEntry
                {
                    Level = logLevel.ToString(),
                    Category = _category,
                    Message = msg,
                    Exception = exception?.ToString(),
                    State = state?.ToString()
                };
                _writer.TryWrite(entry);
            }
        }

        private sealed class LogEntry
        {
            public string Level { get; set; } = string.Empty;
            public string Category { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
            public string? Exception { get; set; }
            public string? State { get; set; }
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            private NullScope() {}
            public void Dispose() { }
        }
    }
}
